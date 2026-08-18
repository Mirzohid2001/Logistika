import random
import requests
import logging
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


def generate_sms_code(length=6):
    return ''.join([str(random.randint(0, 9)) for _ in range(length)])


def send_sms_code(phone, code):
    try:
        url = f"{settings.ESKIZ_API_URL}/message/sms/send"
        data = {
            'mobile_phone': phone,
            'message': f'Your verification code: {code}',
            'from': '4546',
        }
        headers = {
            'Authorization': f'Bearer {get_eskiz_token()}',
            'Content-Type': 'application/json',
        }
        response = requests.post(url, json=data, headers=headers)
        return response.status_code == 200
    except Exception:
        logger.exception('Failed to send SMS code', extra={'event': 'sms_code_failed'})
        return False


def send_notification_sms(phone, message):
    try:
        url = f"{settings.ESKIZ_API_URL}/message/sms/send"
        data = {
            'mobile_phone': phone,
            'message': message,
            'from': '4546',
        }
        headers = {
            'Authorization': f'Bearer {get_eskiz_token()}',
            'Content-Type': 'application/json',
        }
        response = requests.post(url, json=data, headers=headers)
        return response.status_code == 200
    except Exception:
        logger.exception('Failed to send notification SMS', extra={'event': 'sms_notify_failed'})
        return False


def get_eskiz_token():
    cache_key = 'eskiz_token'
    token = cache.get(cache_key)
    
    if token:
        return token
    
    try:
        url = f"{settings.ESKIZ_API_URL}/auth/login"
        data = {
            'email': settings.ESKIZ_EMAIL,
            'password': settings.ESKIZ_PASSWORD,
        }
        response = requests.post(url, json=data)
        if response.status_code == 200:
            token = response.json().get('data', {}).get('token')
            cache.set(cache_key, token, 3600 * 24)
            return token
    except Exception:
        logger.exception('Failed to obtain Eskiz token', extra={'event': 'eskiz_token_failed'})
    
    return None


def _sms_phone_key(phone: str) -> str:
    """Stable cache key across +998 / 998 / 9XXXXXXXX input shapes."""
    from apps.users.phone import normalize_phone

    return normalize_phone(phone) or str(phone or '').strip()


def save_sms_code(phone, code):
    cache_key = f'sms_code_{_sms_phone_key(phone)}'
    cache.set(cache_key, code, settings.SMS_CODE_EXPIRATION_MINUTES * 60)


def _phone_verified_cache_key(phone: str) -> str:
    return f'phone_sms_verified_{_sms_phone_key(phone)}'


def mark_phone_sms_verified(phone: str, ttl_seconds: int = 3600) -> None:
    cache.set(_phone_verified_cache_key(phone), True, ttl_seconds)


def is_phone_sms_verified(phone: str) -> bool:
    from django.conf import settings
    if not getattr(settings, 'SMS_VERIFICATION_REQUIRED', True):
        return True
    return bool(cache.get(_phone_verified_cache_key(phone)))


def verify_sms_code(phone, code):
    cache_key = f'sms_code_{_sms_phone_key(phone)}'
    cached_code = cache.get(cache_key)

    if cached_code and cached_code == code:
        cache.delete(cache_key)
        mark_phone_sms_verified(phone)
        return True

    return False


def get_language_from_request(request):
    lang = request.query_params.get('lang', '').lower()
    if lang in ['ru', 'en', 'uz']:
        return lang
    
    accept_language = request.META.get('HTTP_ACCEPT_LANGUAGE', '')
    if accept_language:
        lang = accept_language.split(',')[0].split('-')[0].lower()
        if lang in ['ru', 'en', 'uz']:
            return lang
    
    return 'ru'

