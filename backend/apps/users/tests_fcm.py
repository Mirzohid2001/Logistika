from unittest.mock import MagicMock, patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.notifications.push_service import PushNotificationService
from apps.users.device_tokens import active_tokens_for_user, register_device_token
from apps.users.models import DeviceFcmToken, User


class DeviceFcmTokenTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998909990001',
            password='pass',
            first_name='Push',
            last_name='User',
        )
        self.other = User.objects.create_user(
            phone='998909990002',
            password='pass',
            first_name='Other',
            last_name='User',
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.user)

    def test_register_keeps_multiple_devices(self):
        register_device_token(self.user, 'token-phone', device_id='phone-1', platform='android')
        register_device_token(self.user, 'token-tablet', device_id='tablet-1', platform='ios')

        tokens = active_tokens_for_user(self.user)
        self.assertCountEqual(tokens, ['token-phone', 'token-tablet'])
        self.assertEqual(DeviceFcmToken.objects.filter(user=self.user, is_active=True).count(), 2)
        self.user.refresh_from_db()
        self.assertEqual(self.user.fcm_token, 'token-tablet')

    def test_same_token_moves_to_new_user(self):
        register_device_token(self.user, 'shared-token', device_id='phone-1', platform='android')
        register_device_token(self.other, 'shared-token', device_id='phone-1', platform='android')

        self.assertEqual(DeviceFcmToken.objects.filter(token='shared-token', user=self.other).count(), 1)
        self.assertFalse(DeviceFcmToken.objects.filter(token='shared-token', user=self.user).exists())

    def test_api_registers_device_metadata(self):
        response = self.api.post(
            '/api/auth/fcm-token/',
            {'fcm_token': 'api-token', 'device_id': 'dev-9', 'platform': 'ios'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        row = DeviceFcmToken.objects.get(token='api-token')
        self.assertEqual(row.user, self.user)
        self.assertEqual(row.device_id, 'dev-9')
        self.assertEqual(row.platform, 'ios')

    def test_push_sends_to_all_active_devices(self):
        register_device_token(self.user, 'good-1', device_id='a', platform='android')
        register_device_token(self.user, 'good-2', device_id='b', platform='ios')
        service = PushNotificationService()
        mock_fcm = MagicMock()
        mock_fcm.notify_single_device.return_value = {'success': 1, 'failure': 0}
        service.push_service = mock_fcm

        ok, error = service.send_notification_detailed(self.user, 'T', 'B')
        self.assertTrue(ok)
        self.assertEqual(error, '')
        self.assertEqual(mock_fcm.notify_single_device.call_count, 2)

    def test_legacy_user_token_is_used_until_devices_exist(self):
        self.user.fcm_token = 'legacy-only'
        self.user.save(update_fields=['fcm_token'])
        self.assertEqual(active_tokens_for_user(self.user), ['legacy-only'])

        register_device_token(self.user, 'device-token', device_id='phone-1', platform='android')
        self.assertEqual(active_tokens_for_user(self.user), ['device-token'])

    def test_invalid_token_is_deactivated(self):
        register_device_token(self.user, 'good-token', device_id='a', platform='android')
        register_device_token(self.user, 'bad-token', device_id='b', platform='ios')
        service = PushNotificationService()
        mock_fcm = MagicMock()

        def _notify(**kwargs):
            if kwargs['registration_id'] == 'bad-token':
                return {'success': 0, 'failure': 1, 'results': [{'error': 'NotRegistered'}]}
            return {'success': 1, 'failure': 0}

        mock_fcm.notify_single_device.side_effect = _notify
        service.push_service = mock_fcm

        ok, _error = service.send_notification_detailed(self.user, 'T', 'B')
        self.assertTrue(ok)
        self.assertFalse(DeviceFcmToken.objects.get(token='bad-token').is_active)
        self.assertTrue(DeviceFcmToken.objects.get(token='good-token').is_active)
        self.user.refresh_from_db()
        self.assertNotEqual(self.user.fcm_token, 'bad-token')
