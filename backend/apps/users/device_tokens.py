from __future__ import annotations

import logging

from django.db import transaction
from django.utils import timezone

from apps.users.models import DeviceFcmToken, User

logger = logging.getLogger(__name__)

INVALID_FCM_ERRORS = {
    'NotRegistered',
    'InvalidRegistration',
    'MismatchSenderId',
    'InvalidApnsCredential',
    'UNREGISTERED',
}


def normalize_platform(value: str | None) -> str:
    raw = (value or '').strip().lower()
    if raw in {DeviceFcmToken.PLATFORM_IOS, DeviceFcmToken.PLATFORM_ANDROID, DeviceFcmToken.PLATFORM_WEB}:
        return raw
    return DeviceFcmToken.PLATFORM_UNKNOWN


@transaction.atomic
def register_device_token(
    user: User,
    token: str,
    *,
    device_id: str = '',
    platform: str = '',
) -> DeviceFcmToken:
    token = (token or '').strip()
    device_id = (device_id or '').strip()[:120]
    platform = normalize_platform(platform)
    if not token:
        raise ValueError('fcm_token is required')

    DeviceFcmToken.objects.filter(token=token).exclude(user=user).delete()
    if device_id:
        DeviceFcmToken.objects.filter(user=user, device_id=device_id).exclude(token=token).delete()

    obj, _created = DeviceFcmToken.objects.update_or_create(
        token=token,
        defaults={
            'user': user,
            'device_id': device_id,
            'platform': platform,
            'is_active': True,
        },
    )
    if device_id and obj.device_id != device_id:
        obj.device_id = device_id
        obj.save(update_fields=['device_id', 'updated_at'])

    if user.fcm_token != token:
        user.fcm_token = token
        user.save(update_fields=['fcm_token', 'updated_at'])

    logger.info(
        'FCM token registered',
        extra={'event': 'fcm_token_registered', 'user_id': user.id},
    )
    return obj


def active_tokens_for_user(user: User) -> list[str]:
    tokens = list(
        DeviceFcmToken.objects.filter(user=user, is_active=True)
        .order_by('-last_seen_at')
        .values_list('token', flat=True)
    )
    if tokens:
        return tokens
    if user.fcm_token:
        return [user.fcm_token]
    return []


def deactivate_tokens(tokens: list[str], *, reason: str = '') -> int:
    if not tokens:
        return 0
    now = timezone.now()
    updated = DeviceFcmToken.objects.filter(token__in=tokens, is_active=True).update(
        is_active=False,
        updated_at=now,
    )
    User.objects.filter(fcm_token__in=tokens).update(fcm_token=None, updated_at=now)
    if updated:
        logger.info(
            'Deactivated invalid FCM tokens',
            extra={'event': 'fcm_token_deactivated', 'count': updated, 'reason': reason},
        )
    return updated
