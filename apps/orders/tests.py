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
            height=10.5,
            width=5.5,
            length=2.5,
            weight=100.0,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
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
            height=10.5,
            width=5.5,
            length=2.5,
            weight=100.0,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
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
        self.assertEqual(len(response.data), 1)

    def test_start_order(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/start/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


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
            height=10.5,
            width=5.5,
            length=2.5,
            weight=100.0,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
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
