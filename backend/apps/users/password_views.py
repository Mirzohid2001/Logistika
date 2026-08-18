from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.cache import cache
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.common.services import verify_sms_code, is_phone_sms_verified
from apps.users.phone import is_valid_uz_phone, normalize_phone, phone_lookup_variants

User = get_user_model()

RESET_RATE_LIMIT_SECONDS = 300
RESET_RATE_LIMIT_MAX = 5


class ResetPasswordView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request={
            'type': 'object',
            'properties': {
                'phone': {'type': 'string'},
                'new_password': {'type': 'string'},
                'new_password_confirm': {'type': 'string'},
                'sms_code': {'type': 'string'},
            },
            'required': ['phone', 'new_password', 'new_password_confirm'],
        },
        responses={200: {'type': 'object'}},
    )
    def post(self, request):
        phone = normalize_phone(request.data.get('phone'))
        new_password = request.data.get('new_password') or ''
        new_password_confirm = request.data.get('new_password_confirm') or ''
        sms_code = (request.data.get('sms_code') or '').strip()

        if not phone:
            return Response({'error': 'Telefon raqam talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
        if not is_valid_uz_phone(phone):
            return Response(
                {'error': 'Telefon raqam formati noto\'g\'ri. Masalan: +998901234567'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if len(new_password) < 8:
            return Response({'error': 'Parol kamida 8 ta belgidan iborat bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)
        if new_password != new_password_confirm:
            return Response({'error': 'Parollar mos kelmadi'}, status=status.HTTP_400_BAD_REQUEST)

        rate_key = f'password_reset_rate_{phone}'
        attempts = int(cache.get(rate_key) or 0)
        if attempts >= RESET_RATE_LIMIT_MAX:
            return Response(
                {'error': 'Juda ko\'p urinish. Birozdan keyin qayta urinib ko\'ring.'},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
        cache.set(rate_key, attempts + 1, RESET_RATE_LIMIT_SECONDS)

        sms_required = getattr(settings, 'SMS_VERIFICATION_REQUIRED', False)
        if sms_required:
            if not sms_code:
                return Response({'error': 'SMS kod talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
            if not verify_sms_code(phone, sms_code) and not is_phone_sms_verified(phone):
                return Response({'error': 'Noto\'g\'ri yoki muddati o\'tgan SMS kod'}, status=status.HTTP_400_BAD_REQUEST)

        user = (
            User.objects.filter(phone__in=phone_lookup_variants(phone), is_active=True)
            .order_by('id')
            .first()
        )
        if user is None:
            return Response({'message': 'Agar akkaunt mavjud bo\'lsa, parol yangilandi.'})

        user.set_password(new_password)
        user.save(update_fields=['password'])
        cache.delete(rate_key)
        return Response({'message': 'Parol muvaffaqiyatli yangilandi'})
