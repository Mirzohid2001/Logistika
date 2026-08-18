from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.bids.models import Bid
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.orders.services import order_pricing_kwargs
from apps.payments.models import Payment

User = get_user_model()


class OrderTotalAmountScopeTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(phone='998906660001', password='pass')
        self.driver_user = User.objects.create_user(
            phone='998906660002',
            password='pass',
            is_driver=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='F1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Financial',
            title_en='Financial',
            title_uz='Financial',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('1000000'),
        )
        self.order_status = OrderStatus.objects.get(code='new')

    def _create_bid(self, amount: str, *, accepted: bool = True) -> Bid:
        bid = Bid.objects.create(
            advertisement=self.ad,
            client=self.client_user,
            driver=self.driver_user,
            is_accepted_by_client=accepted,
            proposed_amounts=[{'by': 'driver', 'amount': amount}],
        )
        return bid

    def test_each_order_uses_its_own_agreed_amount(self):
        first_bid = self._create_bid('400000')
        first_order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.order_status,
            **order_pricing_kwargs(bid=first_bid),
        )

        second_bid = self._create_bid('700000')
        second_order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.order_status,
            **order_pricing_kwargs(bid=second_bid),
        )

        self.assertEqual(first_order.total_amount, Decimal('400000'))
        self.assertEqual(second_order.total_amount, Decimal('700000'))

    def test_legacy_order_scopes_bid_to_creation_time(self):
        old_bid = self._create_bid('300000')
        old_bid.updated_at = timezone.now() - timezone.timedelta(days=2)
        old_bid.save(update_fields=['updated_at'])

        order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.order_status,
        )

        newer_bid = self._create_bid('900000')
        newer_bid.updated_at = timezone.now()
        newer_bid.save(update_fields=['updated_at'])

        self.assertEqual(order.total_amount, Decimal('300000'))


class OrderPaymentConfirmationSyncTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998906660003', password='pass')
        self.driver_user = User.objects.create_user(
            phone='998906660004',
            password='pass',
            is_driver=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='F2',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Sync',
            title_en='Sync',
            title_uz='Sync',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('500000'),
        )
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=OrderStatus.objects.get(code='in_transit'),
            agreed_amount=Decimal('500000'),
        )

    @staticmethod
    def _completed_payment(order, user, amount):
        return Payment.objects.create(
            user=user,
            order=order,
            amount=amount,
            payment_method='mock',
            payment_status='completed',
        )

    def test_platform_payment_does_not_auto_settle_order(self):
        from apps.payments.order_payment import sync_order_payment_confirmation

        self._completed_payment(self.order, self.client_user, Decimal('500000'))
        changed = sync_order_payment_confirmation(self.order)
        self.order.refresh_from_db()
        self.assertFalse(changed)
        self.assertIsNone(self.order.client_payment_confirmed)


class OrderPaidAmountPartialRefundTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone='998906660005', password='pass')
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='F3',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.user,
            title_ru='Refund',
            title_en='Refund',
            title_uz='Refund',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('200000'),
        )
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.user,
            client=self.user,
            status=OrderStatus.objects.get(code='new'),
            agreed_amount=Decimal('200000'),
        )

    def test_paid_amount_subtracts_partial_refunds(self):
        payment = Payment.objects.create(
            user=self.user,
            order=self.order,
            amount=Decimal('200000'),
            payment_method='mock',
            payment_status='completed',
            refund_amount=Decimal('50000'),
            refunded_at=timezone.now(),
        )
        self.assertEqual(self.order.paid_amount, Decimal('150000'))
        self.assertFalse(payment.is_refunded)


class OfflineSettlementEarningsTests(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(phone='998906660006', password='pass')
        self.driver_user = User.objects.create_user(
            phone='998906660007',
            password='pass',
            is_driver=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='F4',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Settle',
            title_en='Settle',
            title_uz='Settle',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('1000000'),
        )
        self.completed_status = OrderStatus.objects.get(code='completed')

    def test_driver_earnings_require_settlement_not_payments(self):
        from apps.orders.financial import driver_gross_settled_earnings, driver_available_payout_balance

        settled_order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.completed_status,
            agreed_amount=Decimal('450000'),
            client_payment_confirmed=True,
            completed_at=timezone.now(),
        )
        unsettled_order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.completed_status,
            agreed_amount=Decimal('300000'),
            client_payment_confirmed=False,
            completed_at=timezone.now(),
        )
        Payment.objects.create(
            user=self.driver_user,
            order=unsettled_order,
            amount=Decimal('999999'),
            payment_method='mock',
            payment_status='completed',
        )

        self.assertEqual(driver_gross_settled_earnings(self.driver_user), Decimal('450000'))
        self.assertEqual(driver_available_payout_balance(self.driver_user), Decimal('450000'))
        self.assertTrue(settled_order.is_payment_settled)
        self.assertFalse(unsettled_order.is_payment_settled)

    def test_payment_disputed_when_client_reports_without_driver_confirm(self):
        order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.completed_status,
            agreed_amount=Decimal('200000'),
            client_paid_reported=True,
            client_payment_confirmed=False,
            completed_at=timezone.now(),
        )
        self.assertTrue(order.payment_disputed)
        from apps.orders.financial import driver_disputed_order_count
        self.assertEqual(driver_disputed_order_count(self.driver_user), 1)

