from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import OrderStatus
from apps.users.document_expiry import (
    DOCUMENT_EXPIRED_CODE,
    driver_has_expired_documents,
    expired_documents_error_payload,
    get_expired_active_documents,
)
from apps.users.models import DriverDocument
from apps.users.serializers import UserSerializer
from apps.vehicles.models import Vehicle

User = get_user_model()


class DocumentExpiryGateTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998907770001',
            password='pass',
            first_name='Client',
            last_name='User',
        )
        self.driver = User.objects.create_user(
            phone='998907770002',
            password='pass',
            first_name='Driver',
            last_name='User',
            is_driver=True,
            is_verified=True,
            document_photos=['driver_doc.jpg'],
        )
        self.country = Country.objects.create(
            name_ru='Uzbekistan',
            name_en='Uzbekistan',
            name_uz="O'zbekiston",
            code='DX1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test',
            title_en='Test',
            title_uz='Test',
            weight=100,
            proposed_cost=50000,
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
        )
        Vehicle.objects.create(
            user=self.driver,
            model='Volvo FH',
            make='Volvo',
            number='10X001AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )
        OrderStatus.objects.get_or_create(
            code='pending',
            defaults={'name_ru': 'Pending', 'name_en': 'Pending', 'name_uz': 'Pending'},
        )
        OrderStatus.objects.get_or_create(
            code='approved_by_client',
            defaults={
                'name_ru': 'Approved',
                'name_en': 'Approved',
                'name_uz': 'Tasdiqlangan',
            },
        )

    def _expire_license(self):
        return DriverDocument.objects.create(
            user=self.driver,
            document_type=DriverDocument.DOC_TYPE_DRIVER_LICENSE,
            document_number='DL-EXP',
            expires_at=timezone.now().date() - timedelta(days=3),
            is_active=True,
        )

    def test_no_dated_documents_is_not_expired(self):
        self.assertFalse(driver_has_expired_documents(self.driver))
        self.assertIsNone(expired_documents_error_payload(self.driver))

    def test_future_document_is_not_expired(self):
        DriverDocument.objects.create(
            user=self.driver,
            document_type=DriverDocument.DOC_TYPE_PASSPORT,
            expires_at=timezone.now().date() + timedelta(days=20),
            is_active=True,
        )
        self.assertFalse(driver_has_expired_documents(self.driver))

    def test_inactive_expired_document_is_ignored(self):
        DriverDocument.objects.create(
            user=self.driver,
            document_type=DriverDocument.DOC_TYPE_DRIVER_LICENSE,
            expires_at=timezone.now().date() - timedelta(days=10),
            is_active=False,
        )
        self.assertFalse(driver_has_expired_documents(self.driver))

    def test_expired_document_payload(self):
        self._expire_license()
        self.assertTrue(driver_has_expired_documents(self.driver))
        payload = expired_documents_error_payload(self.driver)
        self.assertEqual(payload['code'], DOCUMENT_EXPIRED_CODE)
        self.assertEqual(get_expired_active_documents(self.driver).count(), 1)

    def test_user_serializer_exposes_expired_flags(self):
        self._expire_license()
        data = UserSerializer(self.driver).data
        self.assertTrue(data['has_expired_documents'])
        self.assertEqual(data['expired_document_count'], 1)

        clean = User.objects.create_user(
            phone='998907770009',
            password='pass',
            is_driver=True,
        )
        clean_data = UserSerializer(clean).data
        self.assertFalse(clean_data['has_expired_documents'])
        self.assertEqual(clean_data['expired_document_count'], 0)

    def test_bid_create_blocked_when_document_expired(self):
        self._expire_license()
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(
            '/api/bids/',
            {'advertisement': self.advertisement.id, 'proposed_amount': 45000},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), DOCUMENT_EXPIRED_CODE)

    def test_accept_advertisement_blocked_when_document_expired(self):
        self._expire_license()
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/advertisements/{self.advertisement.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), DOCUMENT_EXPIRED_CODE)

    def test_client_cannot_accept_bid_from_expired_driver(self):
        from apps.bids.models import Bid

        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver,
            proposed_amounts=[{'amount': '50000', 'by': 'driver'}],
            last_counter_by='driver',
            is_driver_agreed_to_amount=True,
        )
        self._expire_license()
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), DOCUMENT_EXPIRED_CODE)

    def test_driver_cannot_agree_counter_when_document_expired(self):
        from apps.bids.models import Bid

        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver,
            proposed_amounts=[
                {'amount': '50000', 'by': 'driver'},
                {'amount': '48000', 'by': 'client'},
            ],
            last_counter_by='client',
            is_driver_agreed_to_amount=False,
        )
        self._expire_license()
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/bids/{bid.id}/agree-counter/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), DOCUMENT_EXPIRED_CODE)

    def test_driver_cannot_counter_offer_when_document_expired(self):
        from apps.bids.models import Bid

        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver,
            proposed_amounts=[
                {'amount': '50000', 'by': 'driver'},
                {'amount': '48000', 'by': 'client'},
            ],
            last_counter_by='client',
        )
        self._expire_license()
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(
            f'/api/bids/{bid.id}/counter-offer/',
            {'amount': 47000},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), DOCUMENT_EXPIRED_CODE)
