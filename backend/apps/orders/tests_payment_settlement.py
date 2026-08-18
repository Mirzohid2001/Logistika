from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderProofOfDelivery, OrderRouteStop, OrderStatus

User = get_user_model()

POD_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08'
    b'\x00\x00\x00\x08\x08\x02\x00\x00\x00Km)\xdc\x00\x00'
    b'\x00\x14IDATx\x9cc\x14\tX\xc0\x80\r0a\x15\x1d\xb4\x12'
    b'\x00\xcf\x94\x01\x14\xcb\xbd\xc6M\x00\x00\x00\x00IEND\xaeB`\x82'
)


class OrderPaymentSettlementTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998904440001', password='pass')
        self.driver_user = User.objects.create_user(
            phone='998904440002',
            password='pass',
            is_driver=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UP1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Pay test',
            title_en='Pay test',
            title_uz='Pay test',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('500000'),
        )
        self.in_transit_status = OrderStatus.objects.get(code='in_transit')

    def _create_in_transit_order(self):
        return Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_transit_status,
        )

    def _add_pod(self, order):
        OrderProofOfDelivery.objects.create(
            order=order,
            delivered_by=self.driver_user,
            receiver_name='Receiver',
            delivered_lat=41.311100,
            delivered_lng=69.279700,
            delivery_photo=SimpleUploadedFile('pod.png', POD_PNG, content_type='image/png'),
        )

    def _complete_route_stops(self, order):
        from apps.orders.route_stops import complete_route_stop, ensure_default_route_stops

        ensure_default_route_stops(order)
        for stop in order.route_stops.order_by('sequence'):
            if stop.lat is None or stop.lng is None:
                stop.lat = Decimal('41.3111')
                stop.lng = Decimal('69.2797')
            stop.status = OrderRouteStop.STATUS_ARRIVED
            stop.save(update_fields=['lat', 'lng', 'status'])
            complete_route_stop(order, stop.id, self.driver_user)

    def test_driver_payment_received_settles_order(self):
        order = self._create_in_transit_order()
        self.assertFalse(order.is_payment_settled)

        order.client_payment_confirmed = True
        order.save(update_fields=['client_payment_confirmed'])

        order.refresh_from_db()
        self.assertTrue(order.is_payment_settled)
        self.assertTrue(order.is_fully_paid)
        self.assertEqual(order.remaining_amount, Decimal('0'))
        self.assertEqual(order.payment_progress, 100)

    def test_driver_cannot_complete_without_payment_settlement(self):
        order = self._create_in_transit_order()
        self._add_pod(order)

        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(f'/api/orders/{order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'payment_required')

    def test_driver_can_complete_after_marking_payment_received(self):
        order = self._create_in_transit_order()
        order.client_payment_confirmed = True
        order.client_delivery_confirmed = True
        order.save(update_fields=['client_payment_confirmed', 'client_delivery_confirmed'])
        self._add_pod(order)
        self._complete_route_stops(order)

        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(f'/api/orders/{order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status.code, 'completed')

    def test_driver_can_mark_payment_received_via_api(self):
        order = self._create_in_transit_order()
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(
            f'/api/orders/{order.id}/mark-driver-payment/',
            {'received': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['client_payment_confirmed'])
        self.assertTrue(response.data['is_fully_paid'])

    def test_driver_mark_unpaid_notifies_client(self):
        from unittest.mock import patch

        order = self._create_in_transit_order()
        with patch('apps.orders.payment_notify.create_notification') as mock_notify:
            self.api.force_authenticate(user=self.driver_user)
            response = self.api.post(
                f'/api/orders/{order.id}/mark-driver-payment/',
                {'received': False},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            self.assertFalse(response.data['client_payment_confirmed'])
            mock_notify.assert_called_once()

    def test_mark_unpaid_throttled_within_cooldown(self):
        from unittest.mock import patch

        order = self._create_in_transit_order()
        with patch('apps.orders.payment_notify.create_notification') as mock_notify:
            self.api.force_authenticate(user=self.driver_user)
            first = self.api.post(
                f'/api/orders/{order.id}/mark-driver-payment/',
                {'received': False},
                format='json',
            )
            second = self.api.post(
                f'/api/orders/{order.id}/mark-driver-payment/',
                {'received': False},
                format='json',
            )
            self.assertEqual(first.status_code, status.HTTP_200_OK)
            self.assertEqual(second.status_code, status.HTTP_200_OK)
            self.assertEqual(mock_notify.call_count, 1)

    def test_confirm_delivery_notifies_client_to_pay(self):
        from unittest.mock import patch

        order = self._create_in_transit_order()
        self._add_pod(order)
        with patch('apps.orders.payment_notify.create_notification') as mock_notify:
            self.api.force_authenticate(user=self.client_user)
            response = self.api.post(
                f'/api/orders/{order.id}/confirm-delivery/',
                {'received': True},
                format='json',
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)
            mock_notify.assert_called()
            self.assertEqual(mock_notify.call_args.kwargs['user'], self.client_user)
            self.assertEqual(mock_notify.call_args.kwargs['notification_type'], 'payment_received')

    def test_remaining_amount_subtracts_platform_payments(self):
        from apps.payments.models import Payment

        order = self._create_in_transit_order()
        Payment.objects.create(
            order=order,
            user=self.client_user,
            amount=Decimal('200000'),
            payment_status='completed',
            payment_method='mock',
        )
        self.assertEqual(order.total_amount, Decimal('500000'))
        self.assertEqual(order.paid_amount, Decimal('200000'))
        self.assertEqual(order.remaining_amount, Decimal('300000'))
        self.assertEqual(order.payment_progress, 40.0)
