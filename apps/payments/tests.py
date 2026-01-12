from django.test import TestCase, RequestFactory
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from .models import Payment, PaymentHistory
from apps.orders.models import Order, OrderStatus
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
import hashlib
import hmac
import json

User = get_user_model()


class PaymentModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )

    def test_payment_creation(self):
        payment = Payment.objects.create(
            user=self.user,
            amount=50000.00,
            payment_method='click',
            payment_status='pending'
        )
        self.assertEqual(payment.amount, 50000.00)
        self.assertEqual(payment.payment_method, 'click')
        self.assertEqual(payment.payment_status, 'pending')


class PaymentCallbackSecurityTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.factory = RequestFactory()
        self.user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
        )
        self.advertisement = Advertisement.objects.create(
            client=self.user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz='Test e\'lon',
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            height=10.5,
            width=5.5,
            length=2.5,
            weight=100.0,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
        )
        self.order_status = OrderStatus.objects.get(code='new')
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.user,
            client=self.user,
            status=self.order_status
        )
        
        self.click_payment = Payment.objects.create(
            user=self.user,
            order=self.order,
            amount=50000.00,
            payment_method='click',
            payment_status='pending'
        )
        
        self.payme_payment = Payment.objects.create(
            user=self.user,
            order=self.order,
            amount=30000.00,
            payment_method='payme',
            payment_status='pending'
        )
        
        self.uzum_payment = Payment.objects.create(
            user=self.user,
            order=self.order,
            amount=40000.00,
            payment_method='uzum',
            payment_status='pending'
        )

    def test_click_callback_without_signature_skip_verification(self):
        from django.conf import settings
        original_secret = settings.CLICK_SECRET_KEY
        settings.CLICK_SECRET_KEY = ''
        
        url = f'/api/payments/{self.click_payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.click_payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        settings.CLICK_SECRET_KEY = original_secret

    def test_click_callback_invalid_payment_id(self):
        url = f'/api/payments/{self.click_payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': '999999',
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('mismatch', response.data.get('error', '').lower())

    def test_click_callback_amount_mismatch(self):
        url = f'/api/payments/{self.click_payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.click_payment.id),
            'service_id': '12345',
            'amount': '100000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_payme_callback_without_signature_skip_verification(self):
        from django.conf import settings
        original_secret = settings.PAYME_SECRET_KEY
        settings.PAYME_SECRET_KEY = ''
        
        url = f'/api/payments/{self.payme_payment.id}/callback/'
        callback_data = {
            'method': 'cards.checkPerformTransaction',
            'params': {
                'amount': 3000000,
                'account': {
                    'order_id': str(self.payme_payment.id)
                }
            },
            'id': 1
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        settings.PAYME_SECRET_KEY = original_secret

    def test_payme_callback_invalid_payment_id(self):
        url = f'/api/payments/{self.payme_payment.id}/callback/'
        callback_data = {
            'method': 'cards.checkPerformTransaction',
            'params': {
                'amount': 3000000,
                'account': {
                    'order_id': '999999'
                }
            },
            'id': 1
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_uzum_callback_without_signature_skip_verification(self):
        from django.conf import settings
        original_secret = settings.UZUM_SECRET_KEY
        settings.UZUM_SECRET_KEY = ''
        
        url = f'/api/payments/{self.uzum_payment.id}/callback/'
        callback_data = {
            'order_id': str(self.uzum_payment.id),
            'amount': '40000',
            'status': 'success'
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        settings.UZUM_SECRET_KEY = original_secret

    def test_uzum_callback_invalid_payment_id(self):
        url = f'/api/payments/{self.uzum_payment.id}/callback/'
        callback_data = {
            'order_id': '999999',
            'amount': '40000',
            'status': 'success'
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_callback_payment_not_found(self):
        url = '/api/payments/99999/callback/'
        callback_data = {'status': 'success'}
        
        response = self.client.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_click_callback_success_creates_history(self):
        from django.conf import settings
        original_secret = settings.CLICK_SECRET_KEY
        settings.CLICK_SECRET_KEY = ''
        
        url = f'/api/payments/{self.click_payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.click_payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0
        }
        
        initial_history_count = PaymentHistory.objects.filter(payment=self.click_payment).count()
        response = self.client.post(url, callback_data, format='json')
        final_history_count = PaymentHistory.objects.filter(payment=self.click_payment).count()
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(final_history_count, initial_history_count + 1)
        
        settings.CLICK_SECRET_KEY = original_secret

    def test_click_callback_success_updates_payment_status(self):
        from django.conf import settings
        original_secret = settings.CLICK_SECRET_KEY
        settings.CLICK_SECRET_KEY = ''
        
        url = f'/api/payments/{self.click_payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.click_payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0
        }
        
        response = self.client.post(url, callback_data, format='json')
        self.click_payment.refresh_from_db()
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(self.click_payment.payment_status, 'completed')
        self.assertIsNotNone(self.click_payment.paid_at)
        
        settings.CLICK_SECRET_KEY = original_secret
