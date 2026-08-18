from decimal import Decimal
from unittest.mock import patch

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from django.utils import timezone
from datetime import timedelta

from apps.orders.models import Order, OrderLocationTrack, OrderRouteStop, OrderStatus
from apps.orders.tasks import purge_old_location_tracks
from apps.orders.route_stops import (
    complete_route_stop,
    ensure_default_route_stops,
    get_active_route_stop,
    order_has_geocoded_route_stops,
    parse_coords_from_address,
    process_route_stop_geofence,
    sync_planned_route_from_stops,
)
from apps.orders.routing import optimize_route
from apps.users.models import User

POD_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08'
    b'\x00\x00\x00\x08\x08\x02\x00\x00\x00Km)\xdc\x00\x00'
    b'\x00\x14IDATx\x9cc\x14\tX\xc0\x80\r0a\x15\x1d\xb4\x12'
    b'\x00\xcf\x94\x01\x14\xcb\xbd\xc6M\x00\x00\x00\x00IEND\xaeB`\x82'
)


def _pod_photo():
    return SimpleUploadedFile('pod.png', POD_PNG, content_type='image/png')


class MultiStopRouteTests(TestCase):
    def setUp(self):
        self.country = Country.objects.create(
            name_ru='Uzbekistan',
            name_en='Uzbekistan',
            name_uz='Ozbekiston',
            code='UZB',
        )
        self.city_a = City.objects.create(country=self.country, name_ru='Tashkent', name_en='Tashkent', name_uz='Toshkent')
        self.city_b = City.objects.create(country=self.country, name_ru='Samarkand', name_en='Samarkand', name_uz='Samarqand')
        self.client_user = User.objects.create_user(phone='998901100001', password='pass', first_name='C', last_name='L')
        self.driver = User.objects.create_user(
            phone='998901100002',
            password='pass',
            first_name='D',
            last_name='R',
            is_driver=True,
            is_verified=True,
        )
        self.status, _ = OrderStatus.objects.get_or_create(
            code='pending',
            defaults={'name_ru': 'Pending', 'name_en': 'Pending', 'name_uz': 'Pending'},
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test',
            title_en='Test',
            title_uz='Test',
            weight=Decimal('100'),
            departure_city=self.city_a,
            departure_address='Addr A',
            destination_city=self.city_b,
            destination_address='Addr B',
        )
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status,
        )
        self.api = APIClient()
        self.api.force_authenticate(user=self.driver)

    def test_ensure_default_route_stops(self):
        stops = ensure_default_route_stops(self.order)
        self.assertEqual(len(stops), 2)
        self.assertEqual(self.order.route_stops.count(), 2)
        self.order.refresh_from_db()
        self.assertEqual(len(self.order.planned_route_points), 0)

    def test_parse_coords_from_address(self):
        self.assertEqual(parse_coords_from_address('41.299500, 69.240100'), (41.2995, 69.2401))
        self.assertIsNone(parse_coords_from_address('Toshkent, Amir Temur'))

    def test_ensure_default_route_stops_with_embedded_coords(self):
        self.ad.departure_address = 'Pickup (41.300000, 69.250000)'
        self.ad.destination_address = 'Delivery 41.350000, 69.300000'
        self.ad.save()
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        self.assertEqual(float(pickup.lat), 41.3)
        self.assertEqual(float(pickup.lng), 69.25)
        self.assertEqual(float(delivery.lat), 41.35)
        self.assertEqual(float(delivery.lng), 69.3)

    def test_pickup_stop_complete_auto_departs(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_progress
        self.order.save()
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.status = OrderRouteStop.STATUS_ARRIVED
        pickup.save()
        with patch('apps.common.services.send_notification_sms'), patch(
            'apps.notifications.services.create_notification'
        ), patch('apps.orders.realtime.broadcast_order_status_changed'), patch(
            'apps.orders.views._invalidate_order_list_cache'
        ):
            complete_route_stop(self.order, pickup.id, self.driver)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status.code, 'in_transit')

    def test_sync_planned_route_from_stops(self):
        ensure_default_route_stops(self.order)
        stop = self.order.route_stops.first()
        stop.lat = Decimal('41.3111')
        stop.lng = Decimal('69.2797')
        stop.save()
        sync_planned_route_from_stops(self.order)
        self.order.refresh_from_db()
        self.assertEqual(len(self.order.planned_route_points), 1)

    def test_order_has_geocoded_route_stops(self):
        ensure_default_route_stops(self.order)
        self.assertFalse(order_has_geocoded_route_stops(self.order))
        stop = self.order.route_stops.first()
        stop.lat = Decimal('41.3111')
        stop.lng = Decimal('69.2797')
        stop.save()
        self.assertTrue(order_has_geocoded_route_stops(self.order))

    def test_route_stops_list_api(self):
        ensure_default_route_stops(self.order)
        response = self.api.get(f'/api/orders/{self.order.id}/route-stops/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 2)

    def test_add_route_stop_api(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        response = self.api.post(
            f'/api/orders/{self.order.id}/route-stops/',
            {
                'stop_type': 'delivery',
                'label': 'Extra drop',
                'address': 'Middle point',
                'lat': '41.3200',
                'lng': '69.2800',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertEqual(self.order.route_stops.count(), 3)

    def test_haversine_route_fallback(self):
        stops = [
            {'id': 1, 'lat': 41.31, 'lng': 69.27},
            {'id': 2, 'lat': 41.32, 'lng': 69.28},
        ]
        result = optimize_route(stops, preference='balanced')
        self.assertEqual(result['provider'], 'haversine')
        self.assertGreater(result['distance_meters'], 0)

    @patch('apps.orders.route_views.optimize_route')
    def test_route_optimize_api(self, mock_optimize):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        for stop in self.order.route_stops.all():
            stop.lat = Decimal('41.3111')
            stop.lng = Decimal('69.2797')
            stop.save()
        mock_optimize.return_value = {
            'ordered_stop_ids': list(self.order.route_stops.order_by('sequence').values_list('id', flat=True)),
            'polyline': [{'lat': 41.3111, 'lng': 69.2797}],
            'distance_meters': 1000,
            'duration_seconds': 600,
            'provider': 'haversine',
        }
        response = self.api.post(f'/api/orders/{self.order.id}/route-optimize/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.route_optimization_provider, 'haversine')

    @patch('apps.orders.route_views.optimize_route')
    def test_route_optimize_preserves_stop_metadata_in_planned_route_points(self, mock_optimize):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        for index, stop in enumerate(self.order.route_stops.order_by('sequence'), start=1):
            stop.lat = Decimal(f'41.311{index}')
            stop.lng = Decimal(f'69.279{index}')
            stop.save()
        sync_planned_route_from_stops(self.order)
        before_points = list(self.order.planned_route_points)

        mock_optimize.return_value = {
            'ordered_stop_ids': list(self.order.route_stops.order_by('sequence').values_list('id', flat=True)),
            'polyline': [{'lat': 41.3111, 'lng': 69.2797}, {'lat': 41.3222, 'lng': 69.2800}],
            'distance_meters': 1000,
            'duration_seconds': 600,
            'provider': 'haversine',
        }
        response = self.api.post(f'/api/orders/{self.order.id}/route-optimize/', {}, format='json')
        self.assertEqual(response.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(len(self.order.optimized_route_polyline), 2)
        self.assertEqual(len(self.order.planned_route_points), len(before_points))
        for point in self.order.planned_route_points:
            self.assertIn('id', point)
            self.assertIn('sequence', point)
            self.assertIn('type', point)

    def test_geofence_advances_to_next_pending_stop_after_arrival(self):
        ensure_default_route_stops(self.order)
        stops = list(self.order.route_stops.order_by('sequence'))
        for stop in stops:
            stop.lat = Decimal('41.3111') if stop.sequence == 1 else Decimal('41.3500')
            stop.lng = Decimal('69.2797') if stop.sequence == 1 else Decimal('69.3200')
            stop.geofence_radius_meters = 500
            stop.save()

        first_events = process_route_stop_geofence(self.order, 41.3111, 69.2797)
        self.assertEqual(len(first_events), 1)
        self.assertEqual(first_events[0]['stop_id'], stops[0].id)

        stops[0].refresh_from_db()
        self.assertEqual(stops[0].status, OrderRouteStop.STATUS_ARRIVED)
        active = get_active_route_stop(self.order)
        self.assertIsNotNone(active)
        self.assertEqual(active.id, stops[1].id)

        second_events = process_route_stop_geofence(self.order, 41.3500, 69.3200)
        self.assertEqual(len(second_events), 1)
        self.assertEqual(second_events[0]['stop_id'], stops[1].id)

    def test_geocoded_pickup_cannot_complete_before_arrival(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.save()
        with self.assertRaises(ValueError) as ctx:
            complete_route_stop(self.order, pickup.id, self.driver)
        self.assertIn('yetib', str(ctx.exception).lower())

    def test_depart_requires_pickup_arrival_when_geocoded(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.geofence_radius_meters = 500
        pickup.save()

        blocked = self.api.post(f'/api/orders/{self.order.id}/depart/')
        self.assertEqual(blocked.status_code, 400)

        process_route_stop_geofence(self.order, 41.3111, 69.2797)
        with patch('apps.common.services.send_notification_sms'), patch(
            'apps.notifications.services.create_notification'
        ), patch('apps.orders.realtime.broadcast_order_status_changed'), patch(
            'apps.orders.views._invalidate_order_list_cache'
        ):
            ok = self.api.post(f'/api/orders/{self.order.id}/depart/')
        self.assertEqual(ok.status_code, 200)
        self.order.refresh_from_db()
        self.assertEqual(self.order.status.code, 'in_transit')
        pickup.refresh_from_db()
        self.assertEqual(pickup.status, OrderRouteStop.STATUS_COMPLETED)

    def test_cannot_skip_pickup_or_final_delivery(self):
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        with self.assertRaises(ValueError):
            complete_route_stop(self.order, pickup.id, self.driver, skip=True)
        pickup.status = OrderRouteStop.STATUS_COMPLETED
        pickup.save()
        with self.assertRaises(ValueError):
            complete_route_stop(self.order, delivery.id, self.driver, skip=True)

    def test_pod_requires_in_transit_and_delivery_geofence(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        ensure_default_route_stops(self.order)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        delivery.lat = Decimal('41.3500')
        delivery.lng = Decimal('69.3200')
        delivery.geofence_radius_meters = 300
        delivery.status = OrderRouteStop.STATUS_ARRIVED
        delivery.save()

        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        too_early = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.3500',
                'delivered_lng': '69.3200',
                'delivery_photo': _pod_photo(),
            },
            format='multipart',
        )
        self.assertEqual(too_early.status_code, 400)

        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        far = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.0000',
                'delivered_lng': '69.0000',
                'delivery_photo': _pod_photo(),
            },
            format='multipart',
        )
        self.assertEqual(far.status_code, 400)

        missing_photo = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {'receiver_name': 'Ali', 'delivered_lat': '41.3500', 'delivered_lng': '69.3200'},
            format='json',
        )
        self.assertEqual(missing_photo.status_code, 400)

        ok = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.3500',
                'delivered_lng': '69.3200',
                'delivery_photo': _pod_photo(),
            },
            format='multipart',
        )
        self.assertEqual(ok.status_code, 200)

    @patch('apps.orders.realtime.create_notification')
    @patch('apps.orders.realtime.fanout_order_tracking')
    def test_pod_notifies_client(self, mock_fanout, mock_notify):
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        delivery.lat = Decimal('41.3500')
        delivery.lng = Decimal('69.3200')
        delivery.geofence_radius_meters = 300
        delivery.status = OrderRouteStop.STATUS_ARRIVED
        delivery.save()

        self.api.force_authenticate(user=self.driver)
        ok = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.3500',
                'delivered_lng': '69.3200',
                'delivery_photo': _pod_photo(),
            },
            format='multipart',
        )
        self.assertEqual(ok.status_code, 200)
        mock_notify.assert_called()
        notify_kwargs = mock_notify.call_args.kwargs
        self.assertEqual(notify_kwargs['user'], self.client_user)
        self.assertEqual(notify_kwargs['notification_type'], 'proof_of_delivery')
        fanout_payloads = [call.args[1] for call in mock_fanout.call_args_list]
        self.assertTrue(any(payload.get('type') == 'order_pod_submitted' for payload in fanout_payloads))

    def test_complete_stop_api_returns_400_on_value_error(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.save()
        response = self.api.post(f'/api/orders/{self.order.id}/route-stops/{pickup.id}/complete/')
        self.assertEqual(response.status_code, 400)

    def test_complete_route_stop_out_of_order_rejected(self):
        ensure_default_route_stops(self.order)
        stops = list(self.order.route_stops.order_by('sequence'))
        delivery = stops[-1]
        with self.assertRaises(ValueError) as ctx:
            complete_route_stop(self.order, delivery.id, self.driver)
        self.assertIn('order', str(ctx.exception).lower())

    def test_complete_order_requires_all_route_stops_done(self):
        from apps.orders.models import OrderProofOfDelivery
        from apps.orders.route_stops import order_has_incomplete_route_stops

        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.client_payment_confirmed = True
        self.order.agreed_amount = Decimal('500000')
        self.order.save(update_fields=['status', 'client_payment_confirmed', 'agreed_amount'])
        ensure_default_route_stops(self.order)
        OrderProofOfDelivery.objects.create(
            order=self.order,
            delivered_by=self.driver,
            receiver_name='Receiver',
            delivered_lat=41.311100,
            delivered_lng=69.279700,
            delivery_photo=_pod_photo(),
        )
        self.assertTrue(order_has_incomplete_route_stops(self.order))

        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/orders/{self.order.id}/complete/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('marshrut', response.data.get('error', '').lower())

    def test_in_transit_rejects_route_mutations(self):
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        response = self.api.post(
            f'/api/orders/{self.order.id}/route-stops/',
            {
                'stop_type': 'delivery',
                'label': 'Extra',
                'address': 'X',
                'lat': '41.3200',
                'lng': '69.2800',
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_in_transit_rejects_route_plan(self):
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        response = self.api.post(
            f'/api/orders/{self.order.id}/route-plan/',
            {
                'points': [
                    {'lat': 41.31, 'lng': 69.27},
                    {'lat': 41.32, 'lng': 69.28},
                ]
            },
            format='json',
        )
        self.assertEqual(response.status_code, 400)

    def test_complete_requires_client_delivery_confirmation(self):
        from apps.orders.models import OrderProofOfDelivery

        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.client_payment_confirmed = True
        self.order.agreed_amount = Decimal('500000')
        self.order.save(update_fields=['status', 'client_payment_confirmed', 'agreed_amount'])
        ensure_default_route_stops(self.order)
        for stop in self.order.route_stops.order_by('sequence'):
            stop.lat = Decimal('41.3111')
            stop.lng = Decimal('69.2797')
            stop.status = OrderRouteStop.STATUS_ARRIVED
            stop.save(update_fields=['lat', 'lng', 'status', 'updated_at'])
            complete_route_stop(self.order, stop.id, self.driver)
        OrderProofOfDelivery.objects.create(
            order=self.order,
            delivered_by=self.driver,
            receiver_name='Receiver',
            delivered_lat=41.311100,
            delivered_lng=69.279700,
            delivery_photo=_pod_photo(),
        )
        response = self.api.post(f'/api/orders/{self.order.id}/complete/')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data.get('code'), 'delivery_confirmation_required')

        self.api.force_authenticate(user=self.client_user)
        confirm = self.api.post(
            f'/api/orders/{self.order.id}/confirm-delivery/',
            {'received': True},
            format='json',
        )
        self.assertEqual(confirm.status_code, 200)
        self.api.force_authenticate(user=self.driver)
        done = self.api.post(f'/api/orders/{self.order.id}/complete/')
        self.assertEqual(done.status_code, 200)

    def test_purge_old_location_tracks(self):
        completed_status, _ = OrderStatus.objects.get_or_create(
            code='completed',
            defaults={'name_ru': 'Completed', 'name_en': 'Completed', 'name_uz': 'Completed'},
        )
        self.order.status = completed_status
        self.order.save(update_fields=['status'])
        old_track = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.31'),
            lng=Decimal('69.27'),
        )
        OrderLocationTrack.objects.filter(pk=old_track.pk).update(
            timestamp=timezone.now() - timedelta(days=120),
        )
        result = purge_old_location_tracks()
        self.assertGreater(result['deleted'], 0)
        self.assertFalse(OrderLocationTrack.objects.filter(pk=old_track.pk).exists())

    def test_complete_without_coordinates_is_rejected(self):
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        with self.assertRaises(ValueError) as ctx:
            complete_route_stop(self.order, pickup.id, self.driver)
        self.assertIn('koordinata', str(ctx.exception).lower())

    def test_hydrate_from_advertisement_city_still_requires_arrival(self):
        from apps.orders.route_stops import hydrate_missing_stop_coordinates

        self.city_a.latitude = Decimal('41.3111')
        self.city_a.longitude = Decimal('69.2797')
        self.city_a.save(update_fields=['latitude', 'longitude'])
        self.city_b.latitude = Decimal('39.6542')
        self.city_b.longitude = Decimal('66.9597')
        self.city_b.save(update_fields=['latitude', 'longitude'])
        ensure_default_route_stops(self.order)
        hydrate_missing_stop_coordinates(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        self.assertIsNotNone(pickup.lat)
        self.assertIsNotNone(pickup.lng)
        with self.assertRaises(ValueError) as ctx:
            complete_route_stop(self.order, pickup.id, self.driver)
        self.assertIn('yetib', str(ctx.exception).lower())

    def test_skip_intermediate_requires_reason_and_bypasses_geofence(self):
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        delivery.sequence = 3
        delivery.save(update_fields=['sequence'])
        middle = OrderRouteStop.objects.create(
            order=self.order,
            sequence=2,
            stop_type=OrderRouteStop.STOP_DELIVERY,
            label='Ombor',
            address='Closed warehouse',
        )
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.status = OrderRouteStop.STATUS_ARRIVED
        pickup.save(update_fields=['lat', 'lng', 'status', 'updated_at'])
        complete_route_stop(self.order, pickup.id, self.driver)

        with self.assertRaises(ValueError):
            complete_route_stop(self.order, middle.id, self.driver, skip=True)

        skipped = complete_route_stop(
            self.order,
            middle.id,
            self.driver,
            skip=True,
            skip_reason='warehouse_closed',
        )
        self.assertEqual(skipped.status, OrderRouteStop.STATUS_SKIPPED)
        self.assertIn('warehouse_closed', skipped.notes)

    def test_skip_other_requires_note(self):
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        delivery.sequence = 3
        delivery.save(update_fields=['sequence'])
        middle = OrderRouteStop.objects.create(
            order=self.order,
            sequence=2,
            stop_type=OrderRouteStop.STOP_DELIVERY,
            label='Ombor',
            address='Other stop',
        )
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.status = OrderRouteStop.STATUS_ARRIVED
        pickup.save(update_fields=['lat', 'lng', 'status', 'updated_at'])
        complete_route_stop(self.order, pickup.id, self.driver)
        with self.assertRaises(ValueError):
            complete_route_stop(
                self.order,
                middle.id,
                self.driver,
                skip=True,
                skip_reason='other',
            )
        skipped = complete_route_stop(
            self.order,
            middle.id,
            self.driver,
            skip=True,
            skip_reason='other',
            skip_note='Mijoz omborni yopib qo\'ydi',
        )
        self.assertEqual(skipped.status, OrderRouteStop.STATUS_SKIPPED)

    def test_pod_without_coordinates_is_rejected(self):
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        response = self.api.post(
            f'/api/orders/{self.order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.3500',
                'delivered_lng': '69.3200',
                'delivery_photo': _pod_photo(),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('koordinata', (response.data.get('error') or '').lower())

    def test_skip_intermediate_via_api_requires_reason(self):
        in_progress, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={'name_ru': 'In progress', 'name_en': 'In progress', 'name_uz': 'In progress'},
        )
        self.order.status = in_progress
        self.order.save(update_fields=['status'])
        ensure_default_route_stops(self.order)
        pickup = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_PICKUP)
        delivery = self.order.route_stops.get(stop_type=OrderRouteStop.STOP_DELIVERY)
        delivery.sequence = 3
        delivery.save(update_fields=['sequence'])
        middle = OrderRouteStop.objects.create(
            order=self.order,
            sequence=2,
            stop_type=OrderRouteStop.STOP_DELIVERY,
            label='Ombor',
            address='Closed warehouse',
        )
        pickup.lat = Decimal('41.3111')
        pickup.lng = Decimal('69.2797')
        pickup.status = OrderRouteStop.STATUS_ARRIVED
        pickup.save(update_fields=['lat', 'lng', 'status', 'updated_at'])
        complete_route_stop(self.order, pickup.id, self.driver)

        blocked = self.api.post(
            f'/api/orders/{self.order.id}/route-stops/{middle.id}/complete/',
            {'skip': True},
            format='json',
        )
        self.assertEqual(blocked.status_code, 400)

        skipped = self.api.post(
            f'/api/orders/{self.order.id}/route-stops/{middle.id}/complete/',
            {'skip': True, 'skip_reason': 'warehouse_closed'},
            format='json',
        )
        self.assertEqual(skipped.status_code, 200)
        middle.refresh_from_db()
        self.assertEqual(middle.status, OrderRouteStop.STATUS_SKIPPED)
