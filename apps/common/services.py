import random
import requests
from django.conf import settings
from django.core.cache import cache


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
    except Exception as e:
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
    except Exception as e:
        pass
    
    return None


def save_sms_code(phone, code):
    cache_key = f'sms_code_{phone}'
    cache.set(cache_key, code, settings.SMS_CODE_EXPIRATION_MINUTES * 60)


def verify_sms_code(phone, code):
    cache_key = f'sms_code_{phone}'
    cached_code = cache.get(cache_key)
    
    if cached_code and cached_code == code:
        cache.delete(cache_key)
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

