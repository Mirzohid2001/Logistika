from django.test import TestCase
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
            title_ru='Test Advertisement',
            title_en='Test Advertisement',
            title_uz='Test Advertisement',
            description_ru='Test Description',
            description_en='Test Description',
            description_uz='Test Description',
            weight=100,
            height=1,
            width=1,
            length=1,
            departure_address='Test Address',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test Destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
        )
        
        order_status, _ = OrderStatus.objects.get_or_create(
            code='in_progress',
            defaults={
                'name_ru': 'В процессе',
                'name_en': 'In Progress',
                'name_uz': 'Jarayonda',
            }
        )
        
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
