import requests
import uuid
import hashlib
import hmac
import json
import logging
from django.conf import settings
from apps.common.services import external_http_timeout


logger = logging.getLogger(__name__)


class PaymentSecurityService:
    @staticmethod
    def get_client_ip(request):
        x_forwarded_for = (
            request.META.get('HTTP_X_FORWARDED_FOR')
            if settings.TRUST_X_FORWARDED_FOR
            else None
        )
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip

    @staticmethod
    def check_ip_whitelist(ip, allowed_ips):
        if not allowed_ips:
            return True
        return ip in allowed_ips


class ClickPaymentService:
    @staticmethod
    def create_payment(amount, payment_id=None, order_id=None):
        try:
            url = settings.CLICK_API_URL
            merchant_trans_id = str(payment_id) if payment_id is not None else str(uuid.uuid4())
            data = {
                'merchant_id': settings.CLICK_MERCHANT_ID,
                'service_id': settings.CLICK_SERVICE_ID,
                'amount': float(amount),
                'merchant_trans_id': merchant_trans_id,
                'transaction_param': str(order_id or payment_id or uuid.uuid4()),
            }
            response = requests.post(url, json=data, timeout=external_http_timeout())
            return response.json() if response.status_code == 200 else None
        except Exception:
            logger.exception('Click payment creation failed', extra={'event': 'click_create_failed'})
            return None

    @staticmethod
    def verify_signature(merchant_trans_id, service_id, amount, action, sign_time, click_trans_id, sign_string):
        if not settings.CLICK_SECRET_KEY:
            return settings.DEBUG
        
        secret_key = settings.CLICK_SECRET_KEY
        sign_data = f"{click_trans_id}{service_id}{secret_key}{merchant_trans_id}{amount}{action}{sign_time}"
        expected_signature = hashlib.md5(sign_data.encode('utf-8')).hexdigest()
        
        return hmac.compare_digest(expected_signature.lower(), sign_string.lower())
    
    @staticmethod
    def refund_payment(transaction_id, amount):
        try:
            url = f"{settings.CLICK_API_URL}/refund"
            data = {
                'merchant_id': settings.CLICK_MERCHANT_ID,
                'service_id': settings.CLICK_SERVICE_ID,
                'transaction_id': transaction_id,
                'amount': float(amount),
            }
            response = requests.post(url, json=data, timeout=external_http_timeout())
            if response.status_code == 200:
                return {'success': True, 'data': response.json()}
            return {'success': False, 'error': 'Refund failed'}
        except Exception:
            logger.exception('Click refund failed', extra={'event': 'click_refund_failed'})
            return {'success': False, 'error': 'Payment provider unavailable'}


class PaymePaymentService:
    @staticmethod
    def create_payment(amount, order_id=None):
        try:
            url = f"{settings.PAYME_API_URL}/create"
            data = {
                'method': 'cards.create',
                'params': {
                    'amount': float(amount) * 100,
                    'account': {
                        'order_id': order_id,
                    },
                },
            }
            headers = {
                'X-Auth': settings.PAYME_KEY,
            }
            response = requests.post(url, json=data, headers=headers, timeout=external_http_timeout())
            return response.json() if response.status_code == 200 else None
        except Exception:
            logger.exception('Payme payment creation failed', extra={'event': 'payme_create_failed'})
            return None

    @staticmethod
    def verify_signature(data):
        if not settings.PAYME_SECRET_KEY:
            return settings.DEBUG
        
        params = data.get('params', {}).copy()
        signature = params.pop('signature', '')
        
        if not signature:
            return False
        
        data_copy = data.copy()
        data_copy['params'] = params
        data_json = json.dumps(data_copy, separators=(',', ':'), sort_keys=True)
        expected_signature = hmac.new(
            settings.PAYME_SECRET_KEY.encode('utf-8'),
            data_json.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature, signature)
    
    @staticmethod
    def refund_payment(transaction_id, amount):
        try:
            url = f"{settings.PAYME_API_URL}/refund"
            data = {
                'method': 'cards.refund',
                'params': {
                    'id': transaction_id,
                    'amount': float(amount) * 100,
                },
            }
            headers = {
                'X-Auth': settings.PAYME_KEY,
            }
            response = requests.post(url, json=data, headers=headers, timeout=external_http_timeout())
            if response.status_code == 200:
                return {'success': True, 'data': response.json()}
            return {'success': False, 'error': 'Refund failed'}
        except Exception:
            logger.exception('Payme refund failed', extra={'event': 'payme_refund_failed'})
            return {'success': False, 'error': 'Payment provider unavailable'}


class UzumPaymentService:
    @staticmethod
    def create_payment(amount, order_id=None):
        try:
            url = settings.UZUM_API_URL
            data = {
                'merchant_id': settings.UZUM_MERCHANT_ID,
                'amount': float(amount),
                'order_id': order_id,
            }
            headers = {
                'Authorization': f'Bearer {settings.UZUM_SECRET_KEY}',
            }
            response = requests.post(url, json=data, headers=headers, timeout=external_http_timeout())
            return response.json() if response.status_code == 200 else None
        except Exception:
            logger.exception('Uzum payment creation failed', extra={'event': 'uzum_create_failed'})
            return None

    @staticmethod
    def verify_signature(data):
        if not settings.UZUM_SECRET_KEY:
            return settings.DEBUG
        
        signed_data = data.copy()
        signature = signed_data.pop('signature', '')
        if not signature:
            return False
        
        sorted_data = sorted(signed_data.items())
        message = '&'.join([f"{key}={value}" for key, value in sorted_data])
        expected_signature = hmac.new(
            settings.UZUM_SECRET_KEY.encode('utf-8'),
            message.encode('utf-8'),
            hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(expected_signature.lower(), signature.lower())
    
    @staticmethod
    def refund_payment(transaction_id, amount):
        try:
            url = f"{settings.UZUM_API_URL}/refund"
            data = {
                'merchant_id': settings.UZUM_MERCHANT_ID,
                'transaction_id': transaction_id,
                'amount': float(amount),
            }
            headers = {
                'Authorization': f'Bearer {settings.UZUM_SECRET_KEY}',
            }
            response = requests.post(url, json=data, headers=headers, timeout=external_http_timeout())
            if response.status_code == 200:
                return {'success': True, 'data': response.json()}
            return {'success': False, 'error': 'Refund failed'}
        except Exception:
            logger.exception('Uzum refund failed', extra={'event': 'uzum_refund_failed'})
            return {'success': False, 'error': 'Payment provider unavailable'}
