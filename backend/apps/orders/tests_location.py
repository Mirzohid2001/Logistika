from unittest.mock import AsyncMock, MagicMock, patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.orders.models import Order, OrderStatus, OrderLocationTrack
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City


class LocationTrackingTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )

        self.country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={
                'name_ru': 'Узбекистан',
                'name_en': 'Uzbekistan',
                'name_uz': "O'zbekiston",
            },
        )
        self.city, _ = City.objects.get_or_create(
            country=self.country,
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )

        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz='Test e\'lon',
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            weight=100.0,
            departure_address='Test departure',
            departure_city=self.city,
            destination_address='Test destination',
            destination_city=self.city,
            proposed_cost=500000,
        )

        order_status = OrderStatus.objects.get(code='in_progress')

        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=order_status
        )

    def test_update_location(self):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(float(self.order.current_location_lat), 41.3111)
        self.assertEqual(float(self.order.current_location_lng), 69.2797)

    def test_update_location_sets_driver_presence_fields(self):
        self.client.force_authenticate(user=self.driver)
        before = timezone.now()
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797, 'app_state': 'background'}
        )
        after = timezone.now()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.driver_app_state, 'background')
        self.assertIsNotNone(self.order.driver_last_seen_at)
        self.assertGreaterEqual(self.order.driver_last_seen_at, before)
        self.assertLessEqual(self.order.driver_last_seen_at, after)

        presence = response.data.get('driver_presence')
        self.assertIsNotNone(presence)
        self.assertIn(presence['stale_level'], ['online', 'warning'])
        self.assertEqual(presence['app_state'], 'background')

    @patch('apps.orders.realtime.get_channel_layer')
    def test_update_location_broadcasts_websocket_event(self, mock_get_channel_layer):
        mock_channel = MagicMock()
        mock_channel.group_send = AsyncMock()
        mock_get_channel_layer.return_value = mock_channel
        self.client.force_authenticate(user=self.driver)

        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797, 'app_state': 'foreground'}
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(mock_channel.group_send.called)

        sent_groups = [call.args[0] for call in mock_channel.group_send.call_args_list]
        self.assertIn('dispatcher_tracking', sent_groups)
        self.assertIn(f'order_tracking_{self.order.id}', sent_groups)

        location_payload = None
        for call in mock_channel.group_send.call_args_list:
            payload = call.args[1]
            if payload.get('type') == 'location_update':
                location_payload = payload
                break
        self.assertIsNotNone(location_payload)
        self.assertEqual(location_payload['order_id'], self.order.id)
        self.assertEqual(location_payload['driver_id'], self.driver.id)
        self.assertEqual(location_payload['driver_app_state'], 'foreground')
        self.assertIn('driver_presence', location_payload)

    @patch('apps.orders.realtime.get_channel_layer')
    def test_update_location_broadcasts_speed_and_heading(self, mock_get_channel_layer):
        mock_channel = MagicMock()
        mock_channel.group_send = AsyncMock()
        mock_get_channel_layer.return_value = mock_channel
        self.client.force_authenticate(user=self.driver)

        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {
                'lat': 41.3111,
                'lng': 69.2797,
                'speed_mps': 12.5,
                'heading': 90,
                'app_state': 'foreground',
            },
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertAlmostEqual(float(self.order.current_speed_mps), 12.5)
        self.assertAlmostEqual(float(self.order.current_heading), 90.0)

        location_payload = None
        for call in mock_channel.group_send.call_args_list:
            payload = call.args[1]
            if payload.get('type') == 'location_update':
                location_payload = payload
                break
        self.assertIsNotNone(location_payload)
        self.assertEqual(location_payload['speed_mps'], 12.5)
        self.assertEqual(location_payload['heading'], 90.0)

    @patch('apps.orders.realtime.get_channel_layer')
    def test_update_location_snaps_to_planned_route(self, mock_get_channel_layer):
        mock_channel = MagicMock()
        mock_channel.group_send = AsyncMock()
        mock_get_channel_layer.return_value = mock_channel
        self.order.planned_route_points = [
            {'lat': 41.3000, 'lng': 69.2400},
            {'lat': 41.3000, 'lng': 69.2500},
        ]
        self.order.optimized_route_polyline = []
        self.order.save(update_fields=['planned_route_points', 'optimized_route_polyline', 'updated_at'])

        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {
                'lat': 41.3005,
                'lng': 69.2450,
                'speed_mps': 10,
                'heading': 45,
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        # Snapped onto eastbound centerline → lat should move toward 41.3000
        self.assertAlmostEqual(float(self.order.current_location_lat), 41.3000, places=4)
        self.assertAlmostEqual(float(self.order.current_location_lng), 69.2450, places=4)
        # Route heading overrides noisy device heading for on-road display
        self.assertAlmostEqual(float(self.order.current_heading), 90.0, delta=8.0)

        location_payload = None
        for call in mock_channel.group_send.call_args_list:
            payload = call.args[1]
            if payload.get('type') == 'location_update':
                location_payload = payload
                break
        self.assertIsNotNone(location_payload)
        self.assertTrue(location_payload['snapped'])
        self.assertAlmostEqual(float(location_payload['raw_lat']), 41.3005, places=4)
        self.assertAlmostEqual(float(location_payload['lat']), 41.3000, places=4)
        track = OrderLocationTrack.objects.filter(order=self.order).order_by('-timestamp').first()
        self.assertIsNotNone(track)
        self.assertAlmostEqual(float(track.lat), 41.3005, places=4)
        self.assertAlmostEqual(float(track.lng), 69.2450, places=4)
        self.assertIsNotNone(location_payload.get('route_progress_m'))
        self.assertGreaterEqual(float(location_payload['route_progress_m']), 0.0)

    def test_track_write_throttle_skips_minor_movement(self):
        self.client.force_authenticate(user=self.driver)
        first = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.311100, 'lng': 69.279700}
        )
        second = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.311110, 'lng': 69.279710}
        )

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(OrderLocationTrack.objects.filter(order=self.order).count(), 1)

        self.order.refresh_from_db()
        self.assertEqual(float(self.order.current_location_lat), 41.311110)
        self.assertEqual(float(self.order.current_location_lng), 69.279710)

    def test_track_write_records_significant_movement(self):
        self.client.force_authenticate(user=self.driver)
        self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.311100, 'lng': 69.279700}
        )
        self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.320000, 'lng': 69.290000}
        )

        self.assertEqual(OrderLocationTrack.objects.filter(order=self.order).count(), 2)

    def test_location_tracking_history(self):
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=41.3111,
            lng=69.2797
        )
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=41.3150,
            lng=69.2800
        )

        self.client.force_authenticate(user=self.driver)
        response = self.client.get(f'/api/orders/{self.order.id}/track/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_client_can_see_driver_location(self):
        self.order.current_location_lat = 41.3111
        self.order.current_location_lng = 69.2797
        self.order.save()

        self.client.force_authenticate(user=self.client_user)
        response = self.client.get(f'/api/orders/{self.order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data.get('current_location_lat'))
        self.assertIsNotNone(response.data.get('current_location_lng'))

    def test_multiple_location_updates(self):
        self.client.force_authenticate(user=self.driver)

        locations = [
            {'lat': 41.3111, 'lng': 69.2797},
            {'lat': 41.3150, 'lng': 69.2800},
            {'lat': 41.3200, 'lng': 69.2850},
        ]

        for loc in locations:
            response = self.client.post(
                f'/api/orders/{self.order.id}/update-location/',
                loc
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK)

        tracks = OrderLocationTrack.objects.filter(order=self.order)
        self.assertEqual(tracks.count(), 3)

    def test_depart_order_moves_to_in_transit(self):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(f'/api/orders/{self.order.id}/depart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status.code, 'in_transit')

    def test_location_update_permission(self):
        other_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Other',
            last_name='User'
        )

        self.client.force_authenticate(user=other_user)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_update_location_rejected_for_completed_order(self):
        completed_status = OrderStatus.objects.get(code='completed')
        self.order.status = completed_status
        self.order.save(update_fields=['status', 'updated_at'])

        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'location_updates_not_allowed')

    def test_update_location_rejected_for_pending_order(self):
        pending_status = OrderStatus.objects.get(code='pending')
        self.order.status = pending_status
        self.order.save(update_fields=['status', 'updated_at'])

        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'location_updates_not_allowed')

    def test_update_location_rejected_for_completed_order(self):
        completed_status = OrderStatus.objects.get(code='completed')
        self.order.status = completed_status
        self.order.save(update_fields=['status', 'updated_at'])

        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'location_updates_not_allowed')

    def test_update_location_rejected_for_pending_order(self):
        pending_status = OrderStatus.objects.get(code='pending')
        self.order.status = pending_status
        self.order.save(update_fields=['status', 'updated_at'])

        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            f'/api/orders/{self.order.id}/update-location/',
            {'lat': 41.3111, 'lng': 69.2797},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'location_updates_not_allowed')
