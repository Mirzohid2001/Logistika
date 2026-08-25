from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderRouteStop, OrderStatus
from apps.vehicles.models import Vehicle

User = get_user_model()


def create_test_ad(client, city, **extra):
    data = {
        'client': client,
        'title_ru': 'Test',
        'title_en': 'Test',
        'title_uz': 'Test',
        'weight': Decimal('100'),
        'departure_city': city,
        'departure_address': 'Addr A',
        'destination_city': city,
        'destination_address': 'Addr B',
    }
    data.update(extra)
    return Advertisement.objects.create(**data)


class AdvertisementListFilterTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998901110001', password='pass')
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UZF',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad_mid = create_test_ad(self.client_user, self.city, volume_m3=Decimal('15.0'), cargo_category='fragile')
        self.ad_large = create_test_ad(self.client_user, self.city, volume_m3=Decimal('25.0'), cargo_category='furniture')
        self.ad_small = create_test_ad(self.client_user, self.city, volume_m3=Decimal('5.0'), cargo_category='general')

    def test_volume_min_filter_uses_volume_m3(self):
        response = self.api.get('/api/advertisements/', {'volume_min': '10'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.ad_mid.id, returned_ids)
        self.assertIn(self.ad_large.id, returned_ids)
        self.assertNotIn(self.ad_small.id, returned_ids)

    def test_volume_max_filter_uses_volume_m3(self):
        response = self.api.get('/api/advertisements/', {'volume_max': '20'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.ad_small.id, returned_ids)
        self.assertIn(self.ad_mid.id, returned_ids)
        self.assertNotIn(self.ad_large.id, returned_ids)

    def test_is_fragile_true_maps_to_cargo_category(self):
        response = self.api.get('/api/advertisements/', {'is_fragile': 'true'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.ad_mid.id, returned_ids)
        self.assertNotIn(self.ad_small.id, returned_ids)
        self.assertNotIn(self.ad_large.id, returned_ids)

    def test_is_fragile_false_excludes_fragile_category(self):
        response = self.api.get('/api/advertisements/', {'is_fragile': 'false'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        returned_ids = {item['id'] for item in response.data['results']}
        self.assertIn(self.ad_small.id, returned_ids)
        self.assertIn(self.ad_large.id, returned_ids)
        self.assertNotIn(self.ad_mid.id, returned_ids)


class AdvertisementAcceptRouteStopsTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998901110002', password='pass')
        self.driver = User.objects.create_user(
            phone='998901110003',
            password='pass',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UZA',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = create_test_ad(self.client_user, self.city, proposed_cost=Decimal('500000'))
        Vehicle.objects.create(
            user=self.driver,
            model='Volvo',
            make='Volvo',
            number='01A002AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )
        OrderStatus.objects.get_or_create(
            code='pending',
            defaults={'name_ru': 'Pending', 'name_en': 'Pending', 'name_uz': 'Pending'},
        )

    def test_direct_accept_creates_default_route_stops(self):
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/advertisements/{self.ad.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        order = Order.objects.get(advertisement=self.ad, driver=self.driver)
        self.assertEqual(order.route_stops.count(), 2)
        stop_types = list(order.route_stops.order_by('sequence').values_list('stop_type', flat=True))
        self.assertEqual(stop_types, [OrderRouteStop.STOP_PICKUP, OrderRouteStop.STOP_DELIVERY])
