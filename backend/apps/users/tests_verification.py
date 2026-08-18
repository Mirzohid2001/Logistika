from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.notifications.models import Notification
from apps.users.models import User
from apps.vehicles.models import Vehicle


@override_settings(MEDIA_ROOT='/tmp/logistika_test_media')
class DriverVerificationOnboardingTests(TestCase):
    def setUp(self):
        self.driver = User.objects.create_user(
            phone='998901100099',
            password='pass12345',
            first_name='Driver',
            last_name='Test',
            is_driver=True,
        )
        self.admin = User.objects.create_user(
            phone='998901100088',
            password='pass12345',
            first_name='Admin',
            last_name='User',
            is_staff=True,
        )
        self.client = APIClient()

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_upload_documents_sets_pending_and_notifies_reviewers(self, _mock_push):
        self.client.force_authenticate(user=self.driver)
        photo = SimpleUploadedFile('passport.jpg', b'fake-image', content_type='image/jpeg')
        response = self.client.post(
            '/api/auth/upload-documents/',
            {'document_photos': photo},
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)
        self.driver.refresh_from_db()
        self.assertEqual(self.driver.verification_status, 'pending')
        self.assertFalse(self.driver.is_verified)
        self.assertTrue(Notification.objects.filter(
            user=self.admin,
            notification_type='driver_verification_pending',
        ).exists())

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_vehicle_create_sets_pending_and_notifies_reviewers(self, _mock_push):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            '/api/users/vehicles/',
            {
                'make': 'MAN',
                'model': 'TGX',
                'number': '01A111AA',
                'cargo_volume': '80.00',
                'load_capacity': '20000.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        vehicle = Vehicle.objects.get(number='01A111AA')
        self.assertEqual(vehicle.verification_status, 'pending')
        self.assertFalse(vehicle.is_verified)
        self.assertTrue(Notification.objects.filter(
            user=self.admin,
            notification_type='vehicle_verification_pending',
        ).exists())

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_driver_document_create_sets_pending_and_notifies_reviewers(self, _mock_push):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            '/api/auth/driver-documents/',
            {
                'document_type': 'driver_license',
                'document_number': 'DL-999',
                'expires_at': '2030-12-31',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.driver.refresh_from_db()
        self.assertEqual(self.driver.verification_status, 'pending')
        self.assertTrue(Notification.objects.filter(
            user=self.admin,
            notification_type='driver_verification_pending',
        ).exists())

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_admin_approve_notifies_driver(self, _mock_push):
        self.driver.verification_status = 'pending'
        self.driver.save(update_fields=['verification_status'])
        from apps.users.verification import notify_driver_verification_decision
        notify_driver_verification_decision(self.driver, approved=True)
        self.assertTrue(Notification.objects.filter(
            user=self.driver,
            notification_type='driver_verification_approved',
        ).exists())

    @patch('apps.notifications.services.deliver_push_queue_item', return_value=True)
    def test_admin_reject_notifies_driver(self, _mock_push):
        self.driver.verification_status = 'pending'
        self.driver.save(update_fields=['verification_status'])
        from apps.users.verification import notify_driver_verification_decision
        notify_driver_verification_decision(self.driver, approved=False)
        self.assertTrue(Notification.objects.filter(
            user=self.driver,
            notification_type='driver_verification_rejected',
        ).exists())
