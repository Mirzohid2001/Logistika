from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderProofOfDelivery, OrderStatus
from apps.payments.escrow import (
    fund_escrow_from_payment,
    hold_on_complaint,
    release_escrow_on_complete,
    resolve_complaint_settlement,
    settle_order_cancellation,
)
from apps.payments.ledger import ensure_wallet, money
from apps.payments.models import LedgerEntry, OrderEscrow, Payment
from apps.payments.order_payment import mark_payment_completed
from apps.ratings.models import Complaint

User = get_user_model()


@override_settings(
    ORDER_PLATFORM_PAYMENTS_ENABLED=True,
    PLATFORM_COMMISSION_PERCENT=10,
    CANCELLATION_FEE_CLIENT_AFTER_START_PERCENT=20,
    PAYMENTS_ALLOW_MOCK=True,
)
class EscrowLedgerTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998907770001',
            password='pass',
            first_name='Client',
            last_name='Escrow',
        )
        self.driver_user = User.objects.create_user(
            phone='998907770002',
            password='pass',
            first_name='Driver',
            last_name='Escrow',
            is_driver=True,
        )
        self.staff = User.objects.create_user(
            phone='998907770003',
            password='pass',
            is_dispatcher=True,
        )
        country = Country.objects.create(name_ru='UZ', name_en='UZ', name_uz='UZ', code='EL1')
        self.city = City.objects.create(
            country=country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Escrow',
            title_en='Escrow',
            title_uz='Escrow',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('500000'),
        )
        self.in_transit = OrderStatus.objects.get(code='in_transit')
        self.completed = OrderStatus.objects.get(code='completed')

    def _order(self, *, amount='500000', status=None):
        return Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=status or self.in_transit,
            agreed_amount=Decimal(amount),
        )

    def _pay(self, order, amount='500000') -> Payment:
        payment = Payment.objects.create(
            user=self.client_user,
            order=order,
            amount=Decimal(amount),
            payment_method='mock',
            payment_status='pending',
        )
        mark_payment_completed(payment)
        payment.refresh_from_db()
        return payment

    def test_payment_completion_funds_escrow(self):
        order = self._order()
        self._pay(order)
        escrow = OrderEscrow.objects.get(order=order)
        self.assertEqual(escrow.status, OrderEscrow.STATUS_FUNDED)
        self.assertEqual(escrow.funded_amount, Decimal('500000'))
        order.refresh_from_db()
        self.assertTrue(order.is_payment_settled)
        self.assertTrue(
            LedgerEntry.objects.filter(
                order=order,
                entry_type=LedgerEntry.TYPE_ESCROW_FUND,
            ).exists()
        )

    def test_complete_releases_escrow_minus_commission(self):
        order = self._order()
        self._pay(order)
        ensure_wallet(self.driver_user)
        order.status = self.completed
        order.completed_at = timezone.now()
        order.save(update_fields=['status', 'completed_at', 'updated_at'])
        release_escrow_on_complete(order)

        escrow = OrderEscrow.objects.get(order=order)
        self.assertEqual(escrow.status, OrderEscrow.STATUS_RELEASED)
        self.assertEqual(escrow.commission_amount, Decimal('50000'))
        self.assertEqual(escrow.released_to_driver, Decimal('450000'))

        wallet = ensure_wallet(self.driver_user)
        self.assertEqual(wallet.available, Decimal('450000'))
        self.assertTrue(
            LedgerEntry.objects.filter(entry_type=LedgerEntry.TYPE_COMMISSION, order=order).exists()
        )

    def test_client_cancel_after_start_takes_fee_and_refunds_rest(self):
        order = self._order()
        payment = self._pay(order)
        result = settle_order_cancellation(order, actor='client')

        self.assertEqual(result['fee'], 100000.0)
        escrow = OrderEscrow.objects.get(order=order)
        self.assertEqual(escrow.status, OrderEscrow.STATUS_CANCELLED)
        self.assertEqual(escrow.cancellation_fee, Decimal('100000'))
        self.assertEqual(escrow.refunded_amount, Decimal('400000'))
        payment.refresh_from_db()
        self.assertEqual(payment.refund_amount, Decimal('400000'))

        wallet = ensure_wallet(self.driver_user)
        self.assertEqual(wallet.available, Decimal('100000'))

    def test_complaint_holds_escrow_until_resolved(self):
        order = self._order()
        self._pay(order)
        complaint = Complaint.objects.create(
            order=order,
            from_user=self.client_user,
            to_user=self.driver_user,
            category='payment',
            description='Payment dispute for escrow hold test.',
        )
        hold_on_complaint(complaint)
        escrow = OrderEscrow.objects.get(order=order)
        self.assertEqual(escrow.status, OrderEscrow.STATUS_HELD)

        order.status = self.completed
        order.completed_at = timezone.now()
        order.save(update_fields=['status', 'completed_at', 'updated_at'])
        release_escrow_on_complete(order)
        escrow.refresh_from_db()
        self.assertEqual(escrow.status, OrderEscrow.STATUS_HELD)

        resolve_complaint_settlement(complaint, settlement='release')
        escrow.refresh_from_db()
        self.assertEqual(escrow.status, OrderEscrow.STATUS_RELEASED)
        wallet = ensure_wallet(self.driver_user)
        self.assertEqual(wallet.available, Decimal('450000'))

    def test_complaint_refund_returns_money_to_client(self):
        order = self._order()
        payment = self._pay(order)
        complaint = Complaint.objects.create(
            order=order,
            from_user=self.client_user,
            to_user=self.driver_user,
            category='payment',
            description='Need a full refund after cargo issue.',
        )
        hold_on_complaint(complaint)
        resolve_complaint_settlement(complaint, settlement='refund')

        escrow = OrderEscrow.objects.get(order=order)
        self.assertEqual(escrow.status, OrderEscrow.STATUS_REFUNDED)
        self.assertEqual(escrow.refunded_amount, Decimal('500000'))
        payment.refresh_from_db()
        self.assertEqual(payment.refund_amount, Decimal('500000'))
        wallet = ensure_wallet(self.driver_user)
        self.assertEqual(wallet.available, Decimal('0'))

    def test_payout_debits_wallet(self):
        order = self._order()
        self._pay(order)
        ensure_wallet(self.driver_user)
        order.status = self.completed
        order.completed_at = timezone.now()
        order.save(update_fields=['status', 'completed_at', 'updated_at'])
        release_escrow_on_complete(order)

        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(
            '/api/auth/payout-requests/',
            {'amount': 100000, 'bank_details': '8600'},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        wallet = ensure_wallet(self.driver_user)
        self.assertEqual(wallet.available, Decimal('350000'))

    def test_legacy_offline_earnings_seed_into_wallet(self):
        Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.completed,
            agreed_amount=Decimal('200000'),
            client_payment_confirmed=True,
            completed_at=timezone.now(),
        )
        wallet = ensure_wallet(self.driver_user)
        self.assertTrue(wallet.legacy_seeded)
        self.assertEqual(wallet.available, Decimal('200000'))
        self.assertEqual(money(wallet.available), Decimal('200000.00'))

    def test_cancel_api_applies_client_fee(self):
        order = self._order()
        self._pay(order)
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/orders/{order.id}/cancel/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['cancellation']['fee'], 100000.0)
        order.refresh_from_db()
        self.assertEqual(order.status.code, 'cancelled')
