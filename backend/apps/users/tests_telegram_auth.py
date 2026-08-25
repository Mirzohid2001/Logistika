from urllib.parse import parse_qs, urlparse
from unittest.mock import patch

from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import CompanyMember, User


TELEGRAM_TEST_SETTINGS = {
    'TELEGRAM_ONLY_REGISTRATION': True,
    'TELEGRAM_AUTH_CLIENT_ID': '123456789',
    'TELEGRAM_AUTH_CLIENT_SECRET': 'test-client-secret',
    'TELEGRAM_AUTH_REDIRECT_URI': 'https://api.example.test/api/auth/telegram/callback/',
    'TELEGRAM_AUTH_MOBILE_REDIRECT_URI': 'logistika://auth/telegram',
    'SUBSCRIPTIONS_ENFORCED': False,
}


@override_settings(**TELEGRAM_TEST_SETTINGS)
class TelegramAuthFlowTest(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def _start(self, **overrides):
        payload = {
            'mode': 'register',
            'is_driver': False,
            'company_inn': '444444444',
            'device_id': 'telegram-device-0001',
        }
        for key, value in overrides.items():
            if value is None:
                payload.pop(key, None)
            else:
                payload[key] = value
        response = self.client.post('/api/auth/telegram/start/', payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        authorization_url = response.data['authorization_url']
        params = parse_qs(urlparse(authorization_url).query)
        self.assertEqual(params['scope'], ['openid profile phone'])
        self.assertEqual(params['code_challenge_method'], ['S256'])
        return params['state'][0]

    @staticmethod
    def _claims(**overrides):
        claims = {
            'sub': '900000001',
            'id': 900000001,
            'phone_number': '+998901230001',
            'phone_number_verified': True,
            'given_name': 'Telegram',
            'family_name': 'Client',
            'preferred_username': 'telegram_client',
            'picture': 'https://example.test/avatar.jpg',
        }
        claims.update(overrides)
        return claims

    @patch('apps.users.telegram_views._exchange_authorization_code', return_value='signed-id-token')
    @patch('apps.users.telegram_views._validate_id_token')
    def test_register_callback_creates_user_and_one_time_ticket(self, validate_token, _exchange):
        validate_token.return_value = self._claims()
        state = self._start()

        callback = self.client.get(
            '/api/auth/telegram/callback/',
            {'code': 'authorization-code', 'state': state},
        )
        self.assertEqual(callback.status_code, status.HTTP_302_FOUND)
        callback_params = parse_qs(urlparse(callback['Location']).query)
        ticket = callback_params['ticket'][0]

        user = User.objects.get(telegram_id=900000001)
        self.assertEqual(user.phone, '998901230001')
        self.assertEqual(user.company_inn, '444444444')
        self.assertFalse(user.has_usable_password())
        self.assertTrue(user.is_verified)
        self.assertTrue(CompanyMember.objects.filter(user=user, role=CompanyMember.ROLE_ADMIN).exists())

        complete = self.client.post('/api/auth/telegram/complete/', {'ticket': ticket}, format='json')
        self.assertEqual(complete.status_code, status.HTTP_200_OK)
        self.assertIn('access', complete.data)
        self.assertIn('refresh', complete.data)

        replay = self.client.post('/api/auth/telegram/complete/', {'ticket': ticket}, format='json')
        self.assertEqual(replay.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(replay.data['code'], 'telegram_ticket_invalid')

    @patch('apps.users.telegram_views._exchange_authorization_code', return_value='signed-id-token')
    @patch('apps.users.telegram_views._validate_id_token')
    def test_login_links_existing_account_by_verified_phone(self, validate_token, _exchange):
        existing = User.objects.create_user(
            phone='998901230002',
            password='legacy-password',
            first_name='Legacy',
            last_name='User',
        )
        validate_token.return_value = self._claims(
            sub='900000002',
            id=900000002,
            phone_number='+998901230002',
        )
        state = self._start(mode='login', is_driver=None, company_inn=None)

        callback = self.client.get(
            '/api/auth/telegram/callback/',
            {'code': 'authorization-code', 'state': state},
        )
        self.assertEqual(callback.status_code, status.HTTP_302_FOUND)
        self.assertIn('ticket=', callback['Location'])
        existing.refresh_from_db()
        self.assertEqual(existing.telegram_id, 900000002)
        self.assertTrue(existing.has_usable_password())

    @patch('apps.users.telegram_views._exchange_authorization_code', return_value='signed-id-token')
    @patch('apps.users.telegram_views._validate_id_token')
    def test_login_does_not_create_unknown_account(self, validate_token, _exchange):
        validate_token.return_value = self._claims()
        state = self._start(mode='login', is_driver=None, company_inn=None)
        callback = self.client.get(
            '/api/auth/telegram/callback/',
            {'code': 'authorization-code', 'state': state},
        )
        self.assertEqual(callback.status_code, status.HTTP_302_FOUND)
        self.assertIn('error=account_not_found', callback['Location'])
        self.assertFalse(User.objects.filter(telegram_id=900000001).exists())

    def test_legacy_registration_and_password_reset_are_disabled(self):
        register = self.client.post('/api/auth/register/', {}, format='json')
        reset = self.client.post('/api/auth/reset-password/', {}, format='json')
        self.assertEqual(register.status_code, status.HTTP_410_GONE)
        self.assertEqual(register.data['code'], 'telegram_registration_required')
        self.assertEqual(reset.status_code, status.HTTP_410_GONE)
        self.assertEqual(reset.data['code'], 'telegram_auth_required')


class PasswordResetFailClosedTest(TestCase):
    @override_settings(TELEGRAM_ONLY_REGISTRATION=False, SMS_VERIFICATION_REQUIRED=False)
    def test_sms_code_is_required_even_when_legacy_registration_sms_flag_is_off(self):
        response = APIClient().post(
            '/api/auth/reset-password/',
            {
                'phone': '+998901239999',
                'new_password': 'new-password',
                'new_password_confirm': 'new-password',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('SMS', response.data['error'])
