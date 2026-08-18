from datetime import timedelta
from unittest.mock import patch

from django.conf import settings
from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.payments.models import Payment

from .models import SubscriptionPlan, UserSubscription
from .models import MarketplaceTrialAccount
from .services import calculate_plan_pricing, user_has_active_subscription, user_has_marketplace_access
from .trial import (
    consume_trial_use_for_user,
    get_trial_uses_remaining,
    initialize_marketplace_trial,
)

User = get_user_model()


def auth_client(client: APIClient, user) -> APIClient:
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


@override_settings(
    SUBSCRIPTIONS_ENFORCED=True,
    PAYMENTS_ALLOW_MOCK=True,
    SMS_VERIFICATION_REQUIRED=False,
    SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER=True,
)
class SubscriptionAccessTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            phone='998901240001',
            password='testpass123',
            first_name='Driver',
            last_name='Test',
            is_driver=True,
        )
        self.client_user = User.objects.create_user(
            phone='998901240002',
            password='testpass123',
            first_name='Client',
            last_name='Test',
            is_driver=False,
        )
        self.driver_plan = SubscriptionPlan.objects.get(code='driver_monthly')
        self.client_plan = SubscriptionPlan.objects.get(code='client_monthly')

    def test_driver_with_trial_can_access_orders(self):
        initialize_marketplace_trial(self.driver, device_id='test-device-1')
        auth_client(self.client, self.driver)
        response = self.client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(user_has_marketplace_access(self.driver))

    def test_driver_without_subscription_blocked_from_orders(self):
        account = initialize_marketplace_trial(self.driver, device_id='test-device-2')
        account.free_uses_consumed = account.free_uses_granted
        account.save(update_fields=['free_uses_consumed'])
        auth_client(self.client, self.driver)
        response = self.client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.json().get('code'), 'subscription_required')

    def test_driver_can_access_subscription_endpoints_without_plan(self):
        auth_client(self.client, self.driver)
        response = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(len(response.data) >= 1)

    def test_mock_subscribe_unlocks_api(self):
        auth_client(self.client, self.driver)
        response = self.client.post(
            '/api/subscriptions/subscribe/',
            {'plan_id': self.driver_plan.id, 'payment_method': 'mock'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(user_has_active_subscription(self.driver))

        orders_response = self.client.get('/api/orders/')
        self.assertEqual(orders_response.status_code, status.HTTP_200_OK)

    def test_client_subscribe_plan(self):
        auth_client(self.client, self.client_user)
        response = self.client.post(
            '/api/subscriptions/subscribe/',
            {'plan_id': self.client_plan.id, 'payment_method': 'mock'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        active = UserSubscription.objects.filter(user=self.client_user, status='active').first()
        self.assertIsNotNone(active)
        self.assertGreater(active.expires_at, timezone.now())

    def test_me_endpoint_includes_subscription_status(self):
        initialize_marketplace_trial(self.client_user, device_id='me-endpoint-device')
        auth_client(self.client, self.client_user)
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('subscription', response.data)
        self.assertIn('account', response.data)
        self.assertEqual(response.data['marketplace_role'], 'client')
        self.assertTrue(response.data['account']['subscription_required'])
        self.assertTrue(response.data['account']['can_access_platform'])
        self.assertTrue(response.data['subscription']['required'])
        self.assertFalse(response.data['subscription']['active'])
        self.assertIn('trial', response.data['subscription'])
        self.assertGreaterEqual(response.data['subscription']['trial']['remaining'], 1)

    def test_register_sets_mutually_exclusive_roles(self):
        response = self.client.post(
            '/api/auth/register/',
            {
                'phone': '998901240200',
                'password': 'testpass123',
                'password_confirm': 'testpass123',
                'first_name': 'New',
                'last_name': 'Driver',
                'is_driver': True,
                'device_id': 'register-test-device-001',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone='998901240200')
        self.assertTrue(user.is_driver)
        self.assertFalse(user.is_client)
        self.assertEqual(response.data['user']['marketplace_role'], 'driver')

    def test_plans_show_intro_pricing_for_new_user(self):
        auth_client(self.client, self.client_user)
        response = self.client.get('/api/subscriptions/plans/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        plan = response.data[0]
        self.assertTrue(plan['intro_eligible'])
        self.assertEqual(plan['discount_percent'], 50)
        self.assertEqual(float(plan['your_price']), float(plan['regular_price']) / 2)

    def test_first_subscribe_charges_intro_price(self):
        auth_client(self.client, self.client_user)
        response = self.client.post(
            '/api/subscriptions/subscribe/',
            {'plan_id': self.client_plan.id, 'payment_method': 'mock'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.filter(user=self.client_user).order_by('-id').first()
        expected = self.client_plan.intro_price()
        self.assertEqual(payment.amount, expected)
        sub = UserSubscription.objects.get(user=self.client_user)
        self.assertTrue(sub.is_intro_purchase)
        self.assertEqual(sub.charged_amount, expected)
        self.assertEqual(sub.list_price, self.client_plan.price)

    def test_renewal_charges_full_price(self):
        auth_client(self.client, self.client_user)
        expired_at = timezone.now() - timedelta(days=1)
        UserSubscription.objects.create(
            user=self.client_user,
            plan=self.client_plan,
            status='expired',
            started_at=expired_at - timedelta(days=30),
            expires_at=expired_at,
            list_price=self.client_plan.price,
            charged_amount=self.client_plan.intro_price(),
            intro_discount_percent=50,
            is_intro_purchase=True,
        )
        response = self.client.post(
            '/api/subscriptions/subscribe/',
            {'plan_id': self.client_plan.id, 'payment_method': 'mock'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.order_by('-id').first()
        self.assertEqual(payment.amount, self.client_plan.price)
        sub = UserSubscription.objects.filter(user=self.client_user, status='active').first()
        self.assertFalse(sub.is_intro_purchase)
        self.assertEqual(sub.charged_amount, self.client_plan.price)

    def test_calculate_plan_pricing_service(self):
        pricing = calculate_plan_pricing(self.driver_plan, self.driver)
        self.assertTrue(pricing['intro_eligible'])
        self.assertEqual(pricing['charge_amount'], self.driver_plan.intro_price())
        UserSubscription.objects.create(
            user=self.driver,
            plan=self.driver_plan,
            status='expired',
            started_at=timezone.now() - timedelta(days=60),
            expires_at=timezone.now() - timedelta(days=30),
        )
        renewal = calculate_plan_pricing(self.driver_plan, self.driver)
        self.assertTrue(renewal['intro_eligible'])
        self.assertEqual(renewal['charge_amount'], self.driver_plan.intro_price())

        UserSubscription.objects.create(
            user=self.driver,
            plan=self.driver_plan,
            status='expired',
            started_at=timezone.now() - timedelta(days=90),
            expires_at=timezone.now() - timedelta(days=60),
            is_intro_purchase=True,
        )
        after_intro = calculate_plan_pricing(self.driver_plan, self.driver)
        self.assertFalse(after_intro['intro_eligible'])
        self.assertEqual(after_intro['charge_amount'], self.driver_plan.price)


@override_settings(
    SUBSCRIPTIONS_ENFORCED=True,
    SUBSCRIPTION_FREE_TRIAL_USES=3,
    SMS_VERIFICATION_REQUIRED=False,
    SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER=True,
    REST_FRAMEWORK={
        **settings.REST_FRAMEWORK,
        'DEFAULT_THROTTLE_CLASSES': [],
        'DEFAULT_THROTTLE_RATES': {},
    },
)
class TrialSystemTest(TestCase):
    def setUp(self):
        from apps.users.views import RegisterView

        self.client = APIClient()
        self._register_throttle_patch = patch.object(RegisterView, 'throttle_classes', [])
        self._register_throttle_patch.start()
        self.user_a = User.objects.create_user(
            phone='998901240010',
            password='testpass123',
            first_name='A',
            last_name='User',
            is_driver=True,
        )
        self.user_b = User.objects.create_user(
            phone='998901240011',
            password='testpass123',
            first_name='B',
            last_name='User',
            is_driver=True,
        )

    def tearDown(self):
        self._register_throttle_patch.stop()

    def test_initialize_grants_three_uses(self):
        account = initialize_marketplace_trial(self.user_a, device_id='device-abc')
        self.assertEqual(account.free_uses_granted, 3)
        self.assertEqual(account.uses_remaining, 3)

    def test_second_account_on_same_device_gets_no_trial(self):
        initialize_marketplace_trial(self.user_a, device_id='shared-device')
        account_b = initialize_marketplace_trial(self.user_b, device_id='shared-device')
        self.assertEqual(account_b.free_uses_granted, 0)
        self.assertTrue(account_b.trial_disabled)
        self.assertEqual(account_b.disabled_reason, 'device_reuse')

    def test_consume_trial_decrements_remaining(self):
        initialize_marketplace_trial(self.user_a, device_id='device-consume')
        self.assertTrue(consume_trial_use_for_user(self.user_a))
        account = MarketplaceTrialAccount.objects.get(user=self.user_a)
        self.assertEqual(account.uses_remaining, 2)

    def test_restore_trial_after_cancelled_order(self):
        from apps.advertisements.models import Advertisement
        from apps.locations.models import City, Country
        from apps.orders.models import Order, OrderStatus
        from apps.subscriptions.trial import restore_trial_use_for_user
        from decimal import Decimal

        initialize_marketplace_trial(self.user_a, device_id='device-restore')
        country = Country.objects.create(
            name_ru='UZ', name_en='UZ', name_uz='UZ', code='T1',
        )
        city = City.objects.create(
            country=country, name_ru='T', name_en='T', name_uz='T',
        )
        client_user = User.objects.create_user(phone='998901240099', password='pass')
        ad = Advertisement.objects.create(
            client=client_user,
            title_ru='T',
            title_en='T',
            title_uz='T',
            weight=Decimal('1'),
            departure_city=city,
            departure_address='A',
            destination_city=city,
            destination_address='B',
            proposed_cost=Decimal('1000'),
        )
        order = Order.objects.create(
            advertisement=ad,
            driver=self.user_a,
            client=client_user,
            status=OrderStatus.objects.get(code='new'),
        )
        self.assertTrue(consume_trial_use_for_user(self.user_a, order_id=order.id))
        account = MarketplaceTrialAccount.objects.get(user=self.user_a)
        self.assertEqual(account.uses_remaining, 2)

        self.assertTrue(restore_trial_use_for_user(self.user_a, order_id=order.id))
        account.refresh_from_db()
        self.assertEqual(account.uses_remaining, 3)

    def test_user_without_trial_record_gets_zero_not_auto_grant(self):
        self.assertEqual(get_trial_uses_remaining(self.user_a), 0)
        self.assertFalse(MarketplaceTrialAccount.objects.filter(user=self.user_a).exists())

    def test_register_without_device_id_rejected_when_required(self):
        response = self.client.post(
            '/api/auth/register/',
            {
                'phone': '998901240099',
                'password': 'testpass123',
                'password_confirm': 'testpass123',
                'first_name': 'No',
                'last_name': 'Device',
                'is_driver': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('device_id', str(response.data).lower())


@override_settings(
    SUBSCRIPTIONS_ENFORCED=False,
    SMS_VERIFICATION_REQUIRED=False,
    SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER=True,
)
class SubscriptionDisabledTest(TestCase):
    """Obuna tizimi o'chirilganda marketplace cheklovsiz ishlaydi."""

    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            phone='998901250001',
            password='testpass123',
            first_name='Free',
            last_name='Driver',
            is_driver=True,
        )
        self.client_user = User.objects.create_user(
            phone='998901250002',
            password='testpass123',
            first_name='Free',
            last_name='Client',
            is_driver=False,
        )

    def test_exhausted_trial_still_accesses_orders(self):
        account = initialize_marketplace_trial(self.driver, device_id='disabled-trial-device')
        account.free_uses_consumed = account.free_uses_granted
        account.save(update_fields=['free_uses_consumed'])

        auth_client(self.client, self.driver)
        response = self.client.get('/api/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(user_has_marketplace_access(self.driver))

    def test_me_endpoint_shows_subscription_not_required(self):
        auth_client(self.client, self.client_user)
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['account']['subscription_required'])
        self.assertTrue(response.data['account']['can_access_platform'])
        self.assertFalse(response.data['subscription']['required'])
        self.assertTrue(response.data['subscription']['active'])
        self.assertTrue(response.data['subscription']['has_access'])

    def test_consume_trial_does_not_decrement_when_disabled(self):
        account = initialize_marketplace_trial(self.driver, device_id='no-consume-device')
        remaining_before = account.uses_remaining
        self.assertFalse(consume_trial_use_for_user(self.driver))
        account.refresh_from_db()
        self.assertEqual(account.uses_remaining, remaining_before)

    def test_register_without_device_id_allowed_when_disabled(self):
        response = self.client.post(
            '/api/auth/register/',
            {
                'phone': '998901250099',
                'password': 'testpass123',
                'password_confirm': 'testpass123',
                'first_name': 'No',
                'last_name': 'Device',
                'is_driver': True,
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(phone='998901250099')
        self.assertTrue(user.is_driver)

    def test_subscriptions_enforced_setting_default_is_false(self):
        from apps.subscriptions.services import subscriptions_enforced

        with override_settings(SUBSCRIPTIONS_ENFORCED=False):
            self.assertFalse(subscriptions_enforced())
