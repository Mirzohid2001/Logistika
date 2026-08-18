from django.contrib.auth import get_user_model
from django.test import TestCase
from unittest.mock import patch

from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from apps.orders.models import Order, OrderRouteStop, OrderStatus
from apps.orders.realtime import publish_route_stop_completed

User = get_user_model()


class RouteStopRealtimeTest(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            phone='998901234590',
            password='testpass123',
            first_name='Client',
            last_name='Rt',
            is_driver=False,
        )
        self.driver_user = User.objects.create_user(
            phone='998901234591',
            password='testpass123',
            first_name='Driver',
            last_name='Rt',
            is_driver=True,
        )
        country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'UZ'},
        )
        city, _ = City.objects.get_or_create(
            country=country,
            name_en='Tashkent',
            defaults={'name_ru': 'Tashkent', 'name_uz': 'Tashkent'},
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Rt',
            title_en='Rt',
            title_uz='Rt',
            description_ru='',
            description_en='',
            description_uz='',
            weight=10,
            departure_address='A',
            departure_city=city,
            destination_address='B',
            destination_city=city,
            proposed_cost=500_000,
        )
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver_user,
            client=self.client_user,
            status=OrderStatus.objects.get(code='in_transit'),
        )
        self.stop = OrderRouteStop.objects.create(
            order=self.order,
            sequence=1,
            stop_type=OrderRouteStop.STOP_PICKUP,
            label='Pickup',
            address='A',
            status=OrderRouteStop.STATUS_COMPLETED,
        )

    @patch('apps.orders.realtime.fanout_order_tracking')
    @patch('apps.orders.realtime.create_notification')
    def test_publish_route_stop_completed_broadcasts(self, mock_notify, mock_fanout):
        publish_route_stop_completed(self.order, self.stop, skipped=False)
        mock_fanout.assert_called_once()
        payload = mock_fanout.call_args[0][1]
        self.assertEqual(payload['type'], 'route_stop_completed')
        self.assertEqual(payload['stop_id'], self.stop.id)
        self.assertTrue(mock_notify.called)
