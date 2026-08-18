from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.users.models import User
from apps.notifications.models import Notification, NotificationPreference, PushDeliveryQueue, UserNotificationSettings
from apps.notifications.services import create_notification
from apps.notifications.push_queue import process_pending_push_queue, deliver_push_queue_item
from apps.notifications.preferences import update_user_preferences, user_allows_channel


class NotificationPreferencesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998901112233',
            password='testpass123',
            first_name='Test',
            last_name='User',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_default_preferences_allow_notifications(self):
        self.assertTrue(user_allows_channel(self.user, 'order_created', 'push'))
        self.assertTrue(user_allows_channel(self.user, 'order_created', 'in_app'))

    def test_opt_out_push_for_type(self):
        update_user_preferences(
            self.user,
            {'types': {'order_created': {'push_enabled': False, 'in_app_enabled': True}}},
        )
        self.assertFalse(user_allows_channel(self.user, 'order_created', 'push'))
        self.assertTrue(user_allows_channel(self.user, 'order_created', 'in_app'))

    def test_global_push_disable(self):
        update_user_preferences(self.user, {'push_enabled': False})
        self.assertFalse(user_allows_channel(self.user, 'bid_received', 'push'))

    def test_preferences_api(self):
        response = self.client.get('/api/notifications/preferences/')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data['push_enabled'])

        patch_response = self.client.patch(
            '/api/notifications/preferences/',
            {'push_enabled': False},
            format='json',
        )
        self.assertEqual(patch_response.status_code, 200)
        self.assertFalse(patch_response.data['push_enabled'])


class CreateNotificationServiceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998901112244',
            password='testpass123',
            first_name='Notify',
            last_name='User',
        )

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_create_notification_respects_push_opt_out(self, _mock_deliver):
        NotificationPreference.objects.create(
            user=self.user,
            notification_type='system',
            push_enabled=False,
            in_app_enabled=True,
        )
        notification = create_notification(
            user=self.user,
            notification_type='system',
            title='Hello',
            message='World',
            send_push=True,
        )
        self.assertIsNotNone(notification)
        self.assertEqual(Notification.objects.filter(user=self.user).count(), 1)
        self.assertEqual(PushDeliveryQueue.objects.filter(user=self.user).count(), 0)

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_create_notification_queues_push_when_enabled(self, mock_deliver):
        self.user.fcm_token = 'token-123'
        self.user.save(update_fields=['fcm_token'])
        notification = create_notification(
            user=self.user,
            notification_type='system',
            title='Hello',
            message='World',
            send_push=True,
        )
        self.assertIsNotNone(notification)
        self.assertEqual(PushDeliveryQueue.objects.filter(user=self.user).count(), 1)
        mock_deliver.assert_called_once()


@override_settings(PUSH_MAX_RETRY_ATTEMPTS=3, PUSH_RETRY_BACKOFF_SECONDS=30)
class PushRetryQueueTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998901112255',
            password='testpass123',
            first_name='Push',
            last_name='User',
            fcm_token='token-abc',
        )

    @patch('apps.notifications.push_service.push_service.send_notification_detailed', return_value=(False, 'network_error'))
    def test_failed_push_schedules_retry(self, _mock_send):
        item = PushDeliveryQueue.objects.create(
            user=self.user,
            title='T',
            body='B',
            next_retry_at=timezone.now(),
        )
        deliver_push_queue_item(item)
        item.refresh_from_db()
        self.assertEqual(item.status, PushDeliveryQueue.STATUS_FAILED)
        self.assertEqual(item.attempts, 1)
        self.assertIsNotNone(item.next_retry_at)

    @patch('apps.notifications.push_service.push_service.send_notification_detailed', return_value=(True, ''))
    def test_retry_worker_sends_pending(self, _mock_send):
        item = PushDeliveryQueue.objects.create(
            user=self.user,
            title='T',
            body='B',
            status=PushDeliveryQueue.STATUS_FAILED,
            attempts=1,
            next_retry_at=timezone.now() - timedelta(seconds=5),
        )
        result = process_pending_push_queue()
        item.refresh_from_db()
        self.assertEqual(item.status, PushDeliveryQueue.STATUS_SENT)
        self.assertEqual(result['sent'], 1)
