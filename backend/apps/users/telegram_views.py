from __future__ import annotations

import base64
import hashlib
import logging
import secrets
from urllib.parse import urlencode

import jwt
import requests
from django.conf import settings
from django.core.cache import cache
from django.db import transaction
from django.http import HttpResponseRedirect
from django.utils import timezone
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle
from rest_framework.views import APIView
from rest_framework_simplejwt.tokens import RefreshToken
from drf_spectacular.utils import extend_schema

from apps.subscriptions.trial import (
    device_id_required_on_register,
    initialize_marketplace_trial,
    normalize_device_id,
)
from apps.users.inn import inn_already_registered, validate_company_inn
from apps.users.models import Company, CompanyMember, User
from apps.users.phone import is_valid_uz_phone, normalize_phone, phone_lookup_variants
from apps.users.roles import normalize_registration_roles
from apps.users.serializers import UserSerializer

logger = logging.getLogger(__name__)

STATE_CACHE_PREFIX = 'telegram_oidc_state'
TICKET_CACHE_PREFIX = 'telegram_oidc_ticket'
CONSUMED_CACHE_PREFIX = 'telegram_oidc_consumed'


class TelegramAuthError(Exception):
    def __init__(self, code: str):
        self.code = code
        super().__init__(code)


class TelegramMobileRedirect(HttpResponseRedirect):
    allowed_schemes = ['http', 'https', 'logistika']


class TelegramAuthThrottle(AnonRateThrottle):
    scope = 'telegram_auth'


class TelegramAuthStartSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=('login', 'register'), default='login')
    is_driver = serializers.BooleanField(required=False)
    company_inn = serializers.CharField(required=False, allow_blank=True, max_length=14)
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=128)

    def validate(self, attrs):
        if attrs['mode'] != 'register':
            return attrs

        if 'is_driver' not in attrs:
            raise serializers.ValidationError({'is_driver': 'Akkaunt turini tanlang'})

        is_driver = attrs['is_driver']
        if is_driver:
            attrs['company_inn'] = None
        else:
            try:
                inn = validate_company_inn(attrs.get('company_inn'))
            except ValueError as exc:
                raise serializers.ValidationError({'company_inn': str(exc)}) from exc
            if inn_already_registered(inn):
                raise serializers.ValidationError({
                    'company_inn': 'Bu STIR bilan akkaunt allaqachon mavjud.',
                    'code': 'inn_already_registered',
                })
            attrs['company_inn'] = inn

        device_id = normalize_device_id(attrs.get('device_id'))
        if device_id_required_on_register() and not device_id:
            raise serializers.ValidationError({
                'device_id': 'Qurilma identifikatori talab qilinadi. Ilovani yangilang.',
            })
        attrs['device_id'] = device_id
        return attrs


class TelegramAuthCompleteSerializer(serializers.Serializer):
    ticket = serializers.CharField(min_length=32, max_length=256)


class TelegramAuthStartResponseSerializer(serializers.Serializer):
    authorization_url = serializers.URLField()
    expires_in = serializers.IntegerField()


class TelegramAuthCompleteResponseSerializer(serializers.Serializer):
    user = UserSerializer()
    refresh = serializers.CharField()
    access = serializers.CharField()


def _telegram_is_configured() -> bool:
    return bool(
        settings.TELEGRAM_AUTH_CLIENT_ID
        and settings.TELEGRAM_AUTH_CLIENT_SECRET
        and settings.TELEGRAM_AUTH_REDIRECT_URI
    )


def _cache_key(prefix: str, value: str) -> str:
    digest = hashlib.sha256(value.encode('utf-8')).hexdigest()
    return f'{prefix}:{digest}'


def _consume_cached_value(prefix: str, value: str, ttl_seconds: int):
    key = _cache_key(prefix, value)
    payload = cache.get(key)
    if payload is None:
        return None

    consumed_key = _cache_key(CONSUMED_CACHE_PREFIX, f'{prefix}:{value}')
    if not cache.add(consumed_key, True, timeout=ttl_seconds):
        return None
    cache.delete(key)
    return payload


def _pkce_pair() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(64)
    digest = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b'=').decode('ascii')
    return verifier, challenge


def _mobile_redirect(**params) -> TelegramMobileRedirect:
    base_url = settings.TELEGRAM_AUTH_MOBILE_REDIRECT_URI
    separator = '&' if '?' in base_url else '?'
    return TelegramMobileRedirect(f'{base_url}{separator}{urlencode(params)}')


def _exchange_authorization_code(code: str, code_verifier: str) -> str:
    response = requests.post(
        settings.TELEGRAM_AUTH_TOKEN_URL,
        data={
            'grant_type': 'authorization_code',
            'code': code,
            'redirect_uri': settings.TELEGRAM_AUTH_REDIRECT_URI,
            'client_id': str(settings.TELEGRAM_AUTH_CLIENT_ID),
            'code_verifier': code_verifier,
        },
        auth=(str(settings.TELEGRAM_AUTH_CLIENT_ID), settings.TELEGRAM_AUTH_CLIENT_SECRET),
        timeout=(5, 10),
    )
    response.raise_for_status()
    id_token = response.json().get('id_token')
    if not id_token:
        raise TelegramAuthError('token_missing')
    return id_token


def _validate_id_token(id_token: str, expected_nonce: str) -> dict:
    jwks_client = jwt.PyJWKClient(
        settings.TELEGRAM_AUTH_JWKS_URL,
        cache_jwk_set=True,
        lifespan=300,
        timeout=5,
    )
    signing_key = jwks_client.get_signing_key_from_jwt(id_token)
    claims = jwt.decode(
        id_token,
        signing_key.key,
        algorithms=['RS256'],
        audience=str(settings.TELEGRAM_AUTH_CLIENT_ID),
        issuer=settings.TELEGRAM_AUTH_ISSUER,
        options={'require': ['exp', 'iat', 'iss', 'aud', 'sub']},
    )
    nonce = str(claims.get('nonce') or '')
    if not nonce or not secrets.compare_digest(nonce, expected_nonce):
        raise TelegramAuthError('invalid_nonce')
    return claims


def _telegram_identity(claims: dict) -> dict:
    try:
        telegram_id = int(claims.get('id') or claims['sub'])
    except (KeyError, TypeError, ValueError) as exc:
        raise TelegramAuthError('identity_missing') from exc
    if telegram_id <= 0:
        raise TelegramAuthError('identity_invalid')

    if claims.get('phone_number_verified') is not True:
        raise TelegramAuthError('phone_not_shared')
    phone = normalize_phone(claims.get('phone_number'))
    if not is_valid_uz_phone(phone):
        raise TelegramAuthError('phone_invalid')

    first_name = str(claims.get('given_name') or '').strip()[:150]
    last_name = str(claims.get('family_name') or '').strip()[:150]
    if not first_name:
        name_parts = str(claims.get('name') or '').strip().split(maxsplit=1)
        first_name = (name_parts[0] if name_parts else 'Telegram')[:150]
        if not last_name and len(name_parts) > 1:
            last_name = name_parts[1][:150]

    return {
        'telegram_id': telegram_id,
        'phone': phone,
        'first_name': first_name,
        'last_name': last_name,
        'telegram_username': str(claims.get('preferred_username') or '').lstrip('@')[:64],
        'telegram_photo_url': str(claims.get('picture') or '')[:1000],
    }


def _link_identity(user: User, identity: dict) -> User:
    if user.telegram_id and user.telegram_id != identity['telegram_id']:
        raise TelegramAuthError('phone_already_linked')
    if user.is_blocked or not user.is_active:
        raise TelegramAuthError('account_blocked')

    user.telegram_id = identity['telegram_id']
    user.telegram_username = identity['telegram_username']
    user.telegram_photo_url = identity['telegram_photo_url']
    user.telegram_linked_at = timezone.now()
    if not user.first_name:
        user.first_name = identity['first_name']
    if not user.last_name:
        user.last_name = identity['last_name']
    user.save(update_fields=[
        'telegram_id', 'telegram_username', 'telegram_photo_url', 'telegram_linked_at',
        'first_name', 'last_name', 'updated_at',
    ])
    return user


def _find_or_create_user(identity: dict, flow: dict) -> User:
    user = User.objects.select_for_update().filter(telegram_id=identity['telegram_id']).first()
    if user is None:
        user = (
            User.objects.select_for_update()
            .filter(phone__in=phone_lookup_variants(identity['phone']))
            .order_by('id')
            .first()
        )

    if user is not None:
        return _link_identity(user, identity)
    if flow['mode'] != 'register':
        raise TelegramAuthError('account_not_found')

    is_driver = bool(flow['is_driver'])
    company_inn = flow.get('company_inn')
    if not is_driver:
        try:
            company_inn = validate_company_inn(company_inn)
        except ValueError as exc:
            raise TelegramAuthError('company_inn_invalid') from exc
        if inn_already_registered(company_inn):
            raise TelegramAuthError('company_inn_registered')

    user = User(
        phone=identity['phone'],
        first_name=identity['first_name'],
        last_name=identity['last_name'],
        company_inn=company_inn if not is_driver else None,
        telegram_id=identity['telegram_id'],
        telegram_username=identity['telegram_username'],
        telegram_photo_url=identity['telegram_photo_url'],
        telegram_linked_at=timezone.now(),
        is_verified=not is_driver,
        **normalize_registration_roles(is_driver=is_driver),
    )
    user.set_unusable_password()
    user.save()

    if company_inn and not is_driver:
        company, _ = Company.objects.get_or_create(inn=company_inn)
        CompanyMember.objects.get_or_create(
            company=company,
            user=user,
            defaults={'role': CompanyMember.ROLE_ADMIN},
        )
    initialize_marketplace_trial(user, device_id=flow.get('device_id'))
    return user


class TelegramAuthStartView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [TelegramAuthThrottle]

    @extend_schema(
        request=TelegramAuthStartSerializer,
        responses={200: TelegramAuthStartResponseSerializer},
        summary='Start Telegram OIDC login or registration',
        tags=['Authentication'],
    )
    def post(self, request):
        if not _telegram_is_configured():
            return Response(
                {'error': 'Telegram auth is not configured', 'code': 'telegram_auth_unavailable'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = TelegramAuthStartSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        flow = serializer.validated_data

        state = secrets.token_urlsafe(32)
        nonce = secrets.token_urlsafe(32)
        code_verifier, code_challenge = _pkce_pair()
        state_ttl = settings.TELEGRAM_AUTH_STATE_TTL_SECONDS
        cache.set(
            _cache_key(STATE_CACHE_PREFIX, state),
            {**flow, 'nonce': nonce, 'code_verifier': code_verifier},
            timeout=state_ttl,
        )

        params = {
            'client_id': str(settings.TELEGRAM_AUTH_CLIENT_ID),
            'redirect_uri': settings.TELEGRAM_AUTH_REDIRECT_URI,
            'response_type': 'code',
            'scope': 'openid profile phone',
            'state': state,
            'nonce': nonce,
            'code_challenge': code_challenge,
            'code_challenge_method': 'S256',
        }
        return Response({
            'authorization_url': f'{settings.TELEGRAM_AUTH_AUTHORIZE_URL}?{urlencode(params)}',
            'expires_in': state_ttl,
        })


class TelegramAuthCallbackView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = []

    @extend_schema(exclude=True)
    def get(self, request):
        oauth_error = request.query_params.get('error')
        if oauth_error:
            return _mobile_redirect(error='telegram_cancelled')

        state = request.query_params.get('state') or ''
        code = request.query_params.get('code') or ''
        if not state or not code:
            return _mobile_redirect(error='invalid_callback')

        flow = _consume_cached_value(
            STATE_CACHE_PREFIX,
            state,
            settings.TELEGRAM_AUTH_STATE_TTL_SECONDS,
        )
        if flow is None:
            return _mobile_redirect(error='state_expired')

        try:
            id_token = _exchange_authorization_code(code, flow['code_verifier'])
            claims = _validate_id_token(id_token, flow['nonce'])
            identity = _telegram_identity(claims)
            with transaction.atomic():
                user = _find_or_create_user(identity, flow)
        except TelegramAuthError as exc:
            return _mobile_redirect(error=exc.code)
        except (jwt.PyJWTError, requests.RequestException, ValueError, KeyError):
            logger.exception('Telegram OIDC callback failed', extra={'event': 'telegram_auth_failed'})
            return _mobile_redirect(error='telegram_verification_failed')

        ticket = secrets.token_urlsafe(48)
        ticket_ttl = settings.TELEGRAM_AUTH_TICKET_TTL_SECONDS
        cache.set(
            _cache_key(TICKET_CACHE_PREFIX, ticket),
            {'user_id': user.id},
            timeout=ticket_ttl,
        )
        return _mobile_redirect(ticket=ticket)


class TelegramAuthCompleteView(APIView):
    authentication_classes = []
    permission_classes = [AllowAny]
    throttle_classes = [TelegramAuthThrottle]

    @extend_schema(
        request=TelegramAuthCompleteSerializer,
        responses={200: TelegramAuthCompleteResponseSerializer},
        summary='Exchange a one-time Telegram ticket for application tokens',
        tags=['Authentication'],
    )
    def post(self, request):
        serializer = TelegramAuthCompleteSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        payload = _consume_cached_value(
            TICKET_CACHE_PREFIX,
            serializer.validated_data['ticket'],
            settings.TELEGRAM_AUTH_TICKET_TTL_SECONDS,
        )
        if payload is None:
            return Response(
                {'error': 'Telegram ticket is invalid or expired', 'code': 'telegram_ticket_invalid'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.filter(pk=payload['user_id'], is_active=True, is_blocked=False).first()
        if user is None:
            return Response(
                {'error': 'Account is unavailable', 'code': 'account_blocked'},
                status=status.HTTP_403_FORBIDDEN,
            )

        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user, context={'request': request}).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        })
