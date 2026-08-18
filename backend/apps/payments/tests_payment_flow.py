from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.payments.models import Payment, PaymentHistory
from apps.subscriptions.models import SubscriptionPlan, UserSubscription

User = get_user_model()


def _create_order_with_cost(client_user, driver_user, city, cost=Decimal('500000')):
    ad = Advertisement.objects.create(
        client=client_user,
        title_ru='Pay flow',
        title_en='Pay flow',
        title_uz='Pay flow',
        weight=Decimal('100'),
        departure_city=city,
        departure_address='A',
        destination_city=city,
        destination_address='B',
        proposed_cost=cost,
    )
    order_status = OrderStatus.objects.get(code='new')
    return Order.objects.create(
        advertisement=ad,
        driver=driver_user,
        client=client_user,
        status=order_status,
    )


@override_settings(PAYMENTS_ALLOW_MOCK=True, CLICK_SECRET_KEY='')
class PaymentCreateOrderBlockedTest(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998905550001', password='pass')
        self.driver_user = User.objects.create_user(phone='998905550002', password='pass', is_driver=True)
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='P1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.order = _create_order_with_cost(self.client_user, self.driver_user, self.city)
        self.api.force_authenticate(user=self.client_user)

    def test_order_payment_create_rejected(self):
        response = self.api.post(
            '/api/payments/create/',
            {'order_id': self.order.id, 'amount': '300000', 'payment_method': 'mock'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertIn('platforma', response.data.get('error', '').lower())
        self.assertEqual(Payment.objects.filter(order=self.order).count(), 0)


@override_settings(DEBUG=True, PAYMENTS_ALLOW_MOCK=True, CLICK_SECRET_KEY='')
class PaymentCallbackSubscriptionTest(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(phone='998905550003', password='pass')
        self.plan = SubscriptionPlan.objects.get(code='driver_monthly')
        self.payment = Payment.objects.create(
            user=self.user,
            amount=Decimal('50000'),
            payment_method='click',
            payment_status='pending',
            gateway_response={
                'purpose': 'subscription',
                'plan_id': self.plan.id,
                'plan_code': self.plan.code,
            },
        )

    @patch('apps.orders.realtime.broadcast_order_payment_updated')
    def test_click_callback_does_not_broadcast_for_subscription_payment(self, mock_broadcast):
        url = f'/api/payments/{self.payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0,
        }
        response = self.api.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_broadcast.assert_not_called()

    @patch('apps.orders.realtime.broadcast_order_payment_updated')
    def test_duplicate_callback_is_idempotent(self, mock_broadcast):
        url = f'/api/payments/{self.payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0,
        }
        self.api.post(url, callback_data, format='json')
        initial_history = PaymentHistory.objects.filter(payment=self.payment).count()
        response = self.api.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(PaymentHistory.objects.filter(payment=self.payment).count(), initial_history)
        mock_broadcast.assert_not_called()

    @patch('apps.orders.realtime.broadcast_order_payment_updated')
    def test_click_callback_activates_subscription(self, mock_broadcast):
        url = f'/api/payments/{self.payment.id}/callback/'
        callback_data = {
            'merchant_trans_id': str(self.payment.id),
            'service_id': '12345',
            'amount': '50000',
            'action': 0,
            'sign_time': '1234567890',
            'click_trans_id': '999999',
            'sign_string': 'dummy_signature',
            'error': 0,
        }
        response = self.api.post(url, callback_data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.payment.refresh_from_db()
        self.assertEqual(self.payment.payment_status, 'completed')
        self.assertEqual(self.payment.gateway_response.get('purpose'), 'subscription')
        self.assertEqual(self.payment.gateway_response.get('plan_id'), self.plan.id)

        subscription = UserSubscription.objects.filter(user=self.user, status='active').first()
        self.assertIsNotNone(subscription)
        self.assertEqual(subscription.plan_id, self.plan.id)
        self.assertEqual(subscription.payment_id, self.payment.id)
        mock_broadcast.assert_not_called()


@override_settings(PAYMENTS_ALLOW_MOCK=True)
class PaymentMockRefundTest(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.user = User.objects.create_user(phone='998905550004', password='pass')
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='P3',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.order = _create_order_with_cost(self.user, self.user, self.city)
        self.payment = Payment.objects.create(
            user=self.user,
            order=self.order,
            amount=Decimal('100000'),
            payment_method='mock',
            payment_status='completed',
            transaction_id='mock-refund-test',
        )
        self.api.force_authenticate(user=self.user)

    @patch('apps.orders.realtime.broadcast_order_payment_updated')
    def test_mock_refund_cancels_payment_without_order_broadcast(self, mock_broadcast):
        response = self.api.post(
            f'/api/payments/{self.payment.id}/refund/',
            {'reason': 'Test refund'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.payment_status, 'cancelled')
        self.assertIsNotNone(self.payment.refunded_at)
        mock_broadcast.assert_not_called()

    @patch('apps.orders.realtime.broadcast_order_payment_updated')
    def test_partial_refund_keeps_payment_completed(self, mock_broadcast):
        response = self.api.post(
            f'/api/payments/{self.payment.id}/refund/',
            {'reason': 'Partial', 'amount': '40000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.payment.refresh_from_db()
        self.assertEqual(self.payment.payment_status, 'completed')
        self.assertEqual(self.payment.refund_amount, Decimal('40000'))
        self.assertFalse(self.payment.is_refunded)
        self.assertEqual(self.order.paid_amount, Decimal('60000'))
        mock_broadcast.assert_not_called()
