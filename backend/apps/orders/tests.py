from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import Order, OrderStatus, OrderLocationTrack
from .tasks import update_active_order_locations
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City

User = get_user_model()


class OrderModelTest(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        self.dispatcher_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True,
            is_client=False,
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
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
            proposed_cost=500000
        )
        self.status = OrderStatus.objects.get(code='new')

    def test_order_creation(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.status
        )
        self.assertEqual(order.advertisement, self.advertisement)
        self.assertEqual(order.status.code, 'new')
        self.assertEqual(order.status.name_ru, 'Новый')


class OrderAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        self.dispatcher_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
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
            proposed_cost=500000
        )
        self.new_status = OrderStatus.objects.get(code='new')
        self.in_progress_status = OrderStatus.objects.get(code='in_progress')

    def test_get_orders_list(self):
        Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status
        )
        self.client.force_authenticate(user=self.client_user)
        url = '/api/orders/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)

    def test_start_order(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/start/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_dispatcher_can_get_order_detail(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(f'/api/orders/{order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_dispatcher_cannot_approve_as_client(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.post(f'/api/orders/{order.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_return_quality_classification(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        url = f'/api/orders/{order.id}/return-quality/'
        response = self.client.post(url, {
            'quality_status': 'damaged',
            'note': 'Package opened and damaged',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['return_quality']['quality_status'], 'damaged')

    def test_tracking_share_link_public(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
            planned_route_points=[
                {'lat': 41.3111, 'lng': 69.2797},
                {'lat': 41.3200, 'lng': 69.2900},
            ],
            current_location_lat=41.3111,
            current_location_lng=69.2797,
        )
        self.client.force_authenticate(user=self.client_user)
        create_response = self.client.post(
            f'/api/orders/{order.id}/share-link/',
            {'expires_in_hours': 2},
            format='json'
        )
        self.assertEqual(create_response.status_code, status.HTTP_200_OK)
        token = create_response.data['token']

        self.client.force_authenticate(user=None)
        public_response = self.client.get(f'/api/orders/share/{token}/')
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.data['order_id'], order.id)
        self.assertIn('eta_minutes', public_response.data)


class OrderLocationTrackingTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
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
            proposed_cost=500000
        )
        self.in_progress_status = OrderStatus.objects.get(code='in_progress')

    def test_update_location_creates_track(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/update-location/'
        data = {'lat': '41.3111', 'lng': '69.2797'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_periodic_task_updates_locations(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_periodic_task_skips_recent_updates(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        OrderLocationTrack.objects.create(
            order=order,
            lat=41.3111,
            lng=69.2797,
            timestamp=timezone.now() - timedelta(minutes=5)
        )
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count)

    def test_periodic_task_updates_after_10_minutes(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        old_track = OrderLocationTrack.objects.create(
            order=order,
            lat=41.3111,
            lng=69.2797
        )
        old_track.timestamp = timezone.now() - timedelta(minutes=11)
        old_track.save()
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_geofence_pickup_enter_auto_sets_in_progress(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
            planned_route_points=[
                {'lat': 41.311100, 'lng': 69.279700},
                {'lat': 41.320000, 'lng': 69.290000},
            ],
            pickup_geofence_radius_meters=300,
        )

        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/update-location/'
        response = self.client.post(url, {'lat': '41.311100', 'lng': '69.279700'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertTrue(order.is_in_pickup_geofence)
        self.assertIsNotNone(order.pickup_entered_at)
        self.assertEqual(order.status.code, 'in_progress')
