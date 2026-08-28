from decimal import Decimal

from django.test import TestCase
from django.utils import timezone
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderLocationTrack, OrderStatus
from apps.orders.serializers import OrderSerializer
from apps.orders.tracking_metrics import (
    compute_route_progress,
    estimate_eta_minutes,
    get_navigation_points,
    get_next_target_index,
    remaining_route_distance_m,
    total_route_distance_m,
)
from apps.users.models import User


class TrackingMetricsTests(TestCase):
    def setUp(self):
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UT1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.client_user = User.objects.create_user(phone='998903330001', password='pass')
        self.driver = User.objects.create_user(phone='998903330002', password='pass', is_driver=True)
        self.status, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': 'In transit'},
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='T',
            title_en='T',
            title_uz='T',
            weight=Decimal('10'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
        )
        self.route_points = [
            {'id': 1, 'sequence': 1, 'type': 'pickup', 'lat': 41.30, 'lng': 69.27, 'status': 'completed'},
            {'id': 2, 'sequence': 2, 'type': 'delivery', 'lat': 41.35, 'lng': 69.32, 'status': 'pending'},
        ]
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status,
            planned_route_points=self.route_points,
            current_location_lat=Decimal('41.32'),
            current_location_lng=Decimal('69.29'),
        )

    def test_get_next_target_index_skips_completed_stops(self):
        points = get_navigation_points(self.route_points)
        self.assertEqual(get_next_target_index(points), 1)

    def test_remaining_distance_targets_next_pending_stop(self):
        points = get_navigation_points(
            [
                {'lat': 41.30, 'lng': 69.27, 'status': 'completed'},
                {'lat': 41.33, 'lng': 69.30, 'status': 'pending'},
                {'lat': 41.36, 'lng': 69.33, 'status': 'pending'},
            ]
        )
        remaining = remaining_route_distance_m(41.31, 69.28, points)
        direct_to_final = haversine_helper(41.31, 69.28, 41.36, 69.33)
        self.assertIsNotNone(remaining)
        self.assertGreater(remaining, direct_to_final)

    def test_progress_uses_route_legs_not_final_point_only(self):
        points = get_navigation_points(self.route_points)
        progress, remaining_km = compute_route_progress(41.32, 69.29, points)
        self.assertIsNotNone(progress)
        self.assertGreater(progress, 0)
        self.assertLess(progress, 100)
        total_m = total_route_distance_m(points)
        self.assertGreater(total_m, 0)
        self.assertIsNotNone(remaining_km)

    def test_estimate_eta_uses_remaining_route_distance(self):
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.319'),
            lng=Decimal('69.289'),
            timestamp=timezone.now(),
        )
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.318'),
            lng=Decimal('69.288'),
            timestamp=timezone.now() - timezone.timedelta(minutes=1),
        )
        eta = estimate_eta_minutes(self.order)
        self.assertIsNotNone(eta)
        self.assertGreaterEqual(eta, 1)

    def test_multistop_remaining_includes_pending_legs(self):
        points = get_navigation_points(
            [
                {'lat': 41.30, 'lng': 69.27, 'status': 'completed'},
                {'lat': 41.33, 'lng': 69.30, 'status': 'pending'},
                {'lat': 41.36, 'lng': 69.33, 'status': 'pending'},
            ]
        )
        remaining = remaining_route_distance_m(41.31, 69.28, points)
        self.assertIsNotNone(remaining)
        self.assertGreater(remaining, haversine_helper(41.31, 69.28, 41.36, 69.33))

    def test_tracking_alert_message_uses_request_language(self):
        expected_messages = {
            'ru': 'Водитель стоит без движения уже 18 мин.',
            'uz': 'Haydovchi 18 daqiqadan beri harakatsiz turibdi.',
            'en': 'The driver has been stationary for 18 min.',
        }

        for language, expected in expected_messages.items():
            with self.subTest(language=language):
                request = Request(APIRequestFactory().get('/', HTTP_ACCEPT_LANGUAGE=language))
                serializer = OrderSerializer(context={'request': request})
                self.assertEqual(serializer._tracking_alert_message(18), expected)

    def test_tracking_alert_message_is_empty_for_short_stop(self):
        serializer = OrderSerializer()
        self.assertIsNone(serializer._tracking_alert_message(4))


class TrackedDistanceTests(TestCase):
    def setUp(self):
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UT2',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.client_user = User.objects.create_user(phone='998903330003', password='pass')
        self.driver = User.objects.create_user(phone='998903330004', password='pass', is_driver=True)
        self.status, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': 'In transit'},
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='T',
            title_en='T',
            title_uz='T',
            weight=Decimal('10'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
        )
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status,
            optimized_route_distance_meters=100_000,
        )

    def test_compute_tracked_distance_sums_gps_legs(self):
        from apps.orders.distance_tracking import compute_tracked_distance_meters, build_distance_summary

        now = timezone.now()
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300000'),
            lng=Decimal('69.270000'),
            timestamp=now - timezone.timedelta(minutes=3),
        )
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.301000'),
            lng=Decimal('69.271000'),
            timestamp=now - timezone.timedelta(minutes=2),
        )
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.302000'),
            lng=Decimal('69.272000'),
            timestamp=now - timezone.timedelta(minutes=1),
        )

        meters = compute_tracked_distance_meters(self.order)
        self.assertGreater(meters, 200)
        self.assertLess(meters, 5000)

        summary = build_distance_summary(self.order)
        self.assertEqual(summary['planned_distance_km'], 100.0)
        self.assertGreater(summary['tracked_distance_km'], 0)
        self.assertFalse(summary['is_final'])

    def test_stationary_gps_drift_is_ignored(self):
        from apps.orders.distance_tracking import compute_distance_breakdown

        now = timezone.now()
        t1 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300000'),
            lng=Decimal('69.270000'),
        )
        t2 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300050'),
            lng=Decimal('69.270050'),
        )
        t3 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300080'),
            lng=Decimal('69.270020'),
        )
        OrderLocationTrack.objects.filter(pk=t1.pk).update(timestamp=now - timezone.timedelta(seconds=40))
        OrderLocationTrack.objects.filter(pk=t2.pk).update(timestamp=now - timezone.timedelta(seconds=20))
        OrderLocationTrack.objects.filter(pk=t3.pk).update(timestamp=now)
        breakdown = compute_distance_breakdown(self.order)
        self.assertEqual(breakdown['tracked_m'], 0)

    def test_loaded_distance_starts_after_in_transit(self):
        from apps.orders.distance_tracking import compute_distance_breakdown

        now = timezone.now()
        self.order.in_transit_at = now - timezone.timedelta(minutes=2)
        self.order.save(update_fields=['in_transit_at'])
        t1 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300000'),
            lng=Decimal('69.270000'),
        )
        t2 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.310000'),
            lng=Decimal('69.280000'),
        )
        t3 = OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.320000'),
            lng=Decimal('69.290000'),
        )
        OrderLocationTrack.objects.filter(pk=t1.pk).update(timestamp=now - timezone.timedelta(minutes=4))
        OrderLocationTrack.objects.filter(pk=t2.pk).update(timestamp=now - timezone.timedelta(minutes=3))
        OrderLocationTrack.objects.filter(pk=t3.pk).update(timestamp=now - timezone.timedelta(minutes=1))
        breakdown = compute_distance_breakdown(self.order)
        self.assertGreater(breakdown['deadhead_m'], 0)
        self.assertGreater(breakdown['loaded_m'], 0)
        self.assertEqual(breakdown['tracked_m'], breakdown['deadhead_m'] + breakdown['loaded_m'])

    def test_persist_tracked_distance_on_completed_order(self):
        from apps.orders.distance_tracking import persist_tracked_distance, build_distance_summary

        now = timezone.now()
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.300000'),
            lng=Decimal('69.270000'),
            timestamp=now - timezone.timedelta(minutes=2),
        )
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.310000'),
            lng=Decimal('69.280000'),
            timestamp=now - timezone.timedelta(minutes=1),
        )

        completed_status, _ = OrderStatus.objects.get_or_create(
            code='completed',
            defaults={'name_ru': 'Done', 'name_en': 'Done', 'name_uz': 'Done'},
        )
        self.order.status = completed_status
        self.order.save(update_fields=['status'])

        meters = persist_tracked_distance(self.order)
        self.order.refresh_from_db()
        self.assertEqual(self.order.tracked_distance_meters, meters)
        self.assertIsNotNone(self.order.tracked_distance_computed_at)

        summary = build_distance_summary(self.order)
        self.assertTrue(summary['is_final'])
        self.assertEqual(summary['tracked_distance_km'], round(meters / 1000.0, 1))

    def test_planned_distance_fallback_from_route_stops(self):
        from apps.orders.distance_tracking import build_distance_summary, ensure_estimated_route_distance
        from apps.orders.route_stops import ensure_default_route_stops

        self.ad.departure_address = '41.300000, 69.270000'
        self.ad.destination_address = '41.310000, 69.280000'
        self.ad.save(update_fields=['departure_address', 'destination_address'])
        self.order.optimized_route_distance_meters = None
        self.order.route_optimization_provider = ''
        self.order.save(update_fields=['optimized_route_distance_meters', 'route_optimization_provider', 'updated_at'])
        ensure_default_route_stops(self.order)
        ensure_estimated_route_distance(self.order)
        self.order.refresh_from_db()

        summary = build_distance_summary(self.order)
        self.assertIsNotNone(summary['planned_distance_km'])
        self.assertGreater(summary['planned_distance_km'], 0)
        self.assertEqual(summary['planned_distance_source'], 'straight_line')


def haversine_helper(lat1, lng1, lat2, lng2):
    from apps.orders.route_stops import haversine_meters

    return haversine_meters(lat1, lng1, lat2, lng2)
