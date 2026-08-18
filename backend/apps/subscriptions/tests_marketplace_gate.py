from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.advertisements.models import Advertisement
from apps.bids.models import Bid
from apps.common.exceptions import PermissionDeniedError
from apps.locations.models import City, Country
from apps.orders.models import OrderStatus
from apps.subscriptions.trial import ensure_marketplace_action_allowed, initialize_marketplace_trial
from apps.vehicles.models import Vehicle

User = get_user_model()


def exhaust_marketplace_trial(user, *, device_id: str):
    account = initialize_marketplace_trial(user, device_id=device_id)
    account.free_uses_consumed = account.free_uses_granted
    account.save(update_fields=['free_uses_consumed'])
    return account


def auth_client(api: APIClient, user) -> APIClient:
    token = str(RefreshToken.for_user(user).access_token)
    api.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return api


@override_settings(
    SUBSCRIPTIONS_ENFORCED=True,
    SMS_VERIFICATION_REQUIRED=False,
)
class MarketplaceSubscriptionGateTests(TestCase):
    """403 + subscription_required for marketplace actions (not verification)."""

    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998903330001',
            password='pass',
            is_driver=False,
            company_inn='123456789',
        )
        self.driver_user = User.objects.create_user(
            phone='998903330002',
            password='pass',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='MG1',
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
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
        )
        Vehicle.objects.create(
            user=self.driver_user,
            model='Volvo',
            make='Volvo',
            number='01M001AA',
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
            defaults={'name_ru': 'Approved', 'name_en': 'Approved', 'name_uz': 'Approved'},
        )

    def _assert_subscription_required(self, response):
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        payload = response.json()
        self.assertEqual(payload.get('code'), 'subscription_required')
        self.assertIn('obuna', payload.get('error', '').lower())

    def test_ensure_marketplace_action_allowed_raises_when_trial_exhausted(self):
        exhaust_marketplace_trial(self.driver_user, device_id='gate-driver-1')
        with self.assertRaises(PermissionDeniedError) as ctx:
            ensure_marketplace_action_allowed(self.driver_user)
        self.assertEqual(ctx.exception.default_code, 'subscription_required')

    def test_middleware_blocks_bid_create_with_subscription_required(self):
        exhaust_marketplace_trial(self.driver_user, device_id='gate-driver-bid')
        auth_client(self.api, self.driver_user)
        response = self.api.post(
            '/api/bids/',
            {'advertisement': self.advertisement.id, 'proposed_amount': 45000},
            format='json',
        )
        self._assert_subscription_required(response)

    def test_middleware_blocks_ad_create_with_subscription_required(self):
        exhaust_marketplace_trial(self.client_user, device_id='gate-client-ad')
        auth_client(self.api, self.client_user)
        response = self.api.post(
            '/api/advertisements/',
            {
                'title_ru': 'Test',
                'title_en': 'Test',
                'title_uz': 'Test',
                'description_ru': 'Desc',
                'description_en': 'Desc',
                'description_uz': 'Desc',
                'weight': '100.0',
                'departure_address': 'A',
                'departure_city': self.city.id,
                'destination_address': 'B',
                'destination_city': self.city.id,
            },
            format='json',
        )
        self._assert_subscription_required(response)

    def test_bid_accept_price_returns_subscription_required_when_driver_trial_exhausted(self):
        initialize_marketplace_trial(self.client_user, device_id='gate-client-accept')
        exhaust_marketplace_trial(self.driver_user, device_id='gate-driver-accept')
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '50000', 'by': 'driver'}],
            last_counter_by='driver',
            is_driver_agreed_to_amount=True,
        )
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self._assert_subscription_required(response)

    def test_bid_accept_price_returns_subscription_required_when_client_trial_exhausted(self):
        exhaust_marketplace_trial(self.client_user, device_id='gate-client-accept2')
        initialize_marketplace_trial(self.driver_user, device_id='gate-driver-accept2')
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '50000', 'by': 'driver'}],
            last_counter_by='driver',
            is_driver_agreed_to_amount=True,
        )
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self._assert_subscription_required(response)

    def test_advertisement_accept_returns_subscription_required_when_driver_trial_exhausted(self):
        initialize_marketplace_trial(self.client_user, device_id='gate-client-direct')
        exhaust_marketplace_trial(self.driver_user, device_id='gate-driver-direct')
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(f'/api/advertisements/{self.advertisement.id}/accept/')
        self._assert_subscription_required(response)

    def test_unverified_driver_bid_returns_verification_error_not_subscription(self):
        unverified_driver = User.objects.create_user(
            phone='998903330003',
            password='pass',
            is_driver=True,
            is_verified=False,
            document_photos=['doc.jpg'],
        )
        Vehicle.objects.create(
            user=unverified_driver,
            model='MAN',
            make='MAN',
            number='01M002AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )
        initialize_marketplace_trial(unverified_driver, device_id='gate-unverified-trial')
        self.api.force_authenticate(user=unverified_driver)
        response = self.api.post(
            '/api/bids/',
            {'advertisement': self.advertisement.id, 'proposed_amount': 45000},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        payload = response.json()
        self.assertNotEqual(payload.get('code'), 'subscription_required')
        self.assertIn('tasdiqlanmagan', payload.get('error', '').lower())
