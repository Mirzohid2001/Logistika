from django.test import TestCase
from rest_framework.test import APIClient

from apps.locations.geo import find_nearest_city, haversine_km
from apps.locations.models import City, Country


class NearestCityTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'UZ'},
        )
        self.tashkent, _ = City.objects.get_or_create(
            country=self.country,
            name_ru='Ташкент',
            defaults={
                'name_en': 'Tashkent',
                'name_uz': 'Toshkent',
                'latitude': 41.299500,
                'longitude': 69.240100,
            },
        )
        if self.tashkent.latitude is None or self.tashkent.longitude is None:
            self.tashkent.latitude = 41.299500
            self.tashkent.longitude = 69.240100
            self.tashkent.save(update_fields=['latitude', 'longitude'])
        self.samarkand, _ = City.objects.get_or_create(
            country=self.country,
            name_ru='Самарканд',
            defaults={
                'name_en': 'Samarkand',
                'name_uz': 'Samarqand',
                'latitude': 39.654200,
                'longitude': 66.959700,
            },
        )
        if self.samarkand.latitude is None or self.samarkand.longitude is None:
            self.samarkand.latitude = 39.654200
            self.samarkand.longitude = 66.959700
            self.samarkand.save(update_fields=['latitude', 'longitude'])

    def test_haversine_and_nearest(self):
        city, distance = find_nearest_city(41.31, 69.25)
        self.assertEqual(city.id, self.tashkent.id)
        self.assertIsNotNone(distance)
        self.assertLess(distance, 5)

        far = haversine_km(41.3, 69.2, 39.65, 66.96)
        self.assertGreater(far, 200)

    def test_nearest_city_api(self):
        ok = self.api.get('/api/locations/nearest-city/', {'lat': 41.31, 'lng': 69.25})
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['id'], self.tashkent.id)
        self.assertIn('distance_km', ok.data)

        bad = self.api.get('/api/locations/nearest-city/')
        self.assertEqual(bad.status_code, 400)

        nowhere = self.api.get('/api/locations/nearest-city/', {'lat': 0.1, 'lng': 0.1, 'max_km': 50})
        self.assertEqual(nowhere.status_code, 404)
