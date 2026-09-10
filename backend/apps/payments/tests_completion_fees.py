from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.payments.completion_fees import completion_fee_summary
from apps.payments.models import OrderCompletionFee, OrderCompletionFeeSettings


User = get_user_model()


@override_settings(PAYMENTS_ALLOW_MOCK=True, PREPAID_BALANCES_ENFORCED=True)
class LegacyCompletionFeeCompatibilityTests(TestCase):
    """Old records remain auditable but no longer create a post-order account gate."""

    def setUp(self):
        self.client_user = User.objects.create_user(phone='998907770001', password='pass')
        self.driver_user = User.objects.create_user(
            phone='998907770002',
            password='pass',
            is_driver=True,
        )
        country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='CF1',
        )
        city = City.objects.create(
            country=country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Legacy fee test',
            title_en='Legacy fee test',
            title_uz='Legacy fee test',
            weight=Decimal('100'),
            departure_city=city,
            departure_address='A',
            destination_city=city,
            destination_address='B',
            proposed_cost=Decimal('500000'),
        )
        OrderCompletionFeeSettings.objects.update_or_create(
            pk=1,
            defaults={
                'is_enabled': True,
                'client_fee_enabled': True,
                'driver_fee_enabled': True,
                'client_fee_amount': Decimal('50'),
                'driver_fee_amount': Decimal('50'),
                'currency': 'USD',
            },
        )

    def test_completing_order_does_not_create_new_post_order_debt(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            status=OrderStatus.objects.get(code='completed'),
            agreed_amount=Decimal('500000'),
            completed_at=timezone.now(),
        )

        self.assertFalse(OrderCompletionFee.objects.filter(order=order).exists())

    def test_legacy_pending_fee_is_visible_but_does_not_block_marketplace(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            status=OrderStatus.objects.get(code='completed'),
            agreed_amount=Decimal('500000'),
            completed_at=timezone.now(),
        )
        OrderCompletionFee.objects.create(
            order=order,
            user=self.client_user,
            role=OrderCompletionFee.ROLE_CLIENT,
            amount=Decimal('50'),
            currency='USD',
        )

        summary = completion_fee_summary(self.client_user)
        self.assertEqual(summary['pending_count'], 1)
        self.assertFalse(summary['required'])
        self.assertTrue(summary['marketplace_actions_allowed'])
