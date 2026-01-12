from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import Country, City


class LocationModelTest(TestCase):
    def setUp(self):
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

    def test_country_creation(self):
        self.assertEqual(self.country.name_ru, 'Узбекистан')
        self.assertEqual(self.country.code, 'UZ')

    def test_city_creation(self):
        self.assertEqual(self.city.name_ru, 'Ташкент')
        self.assertEqual(self.city.country, self.country)


class LocationAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
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

    def test_get_countries(self):
        url = '/api/locations/countries/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn('name', response.data[0])

    def test_get_cities(self):
        url = '/api/locations/cities/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn('name', response.data[0])

    def test_get_cities_by_country(self):
        url = f'/api/locations/cities/?country_id={self.country.id}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_country_language_support_ru(self):
        url = '/api/locations/countries/?lang=ru'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Узбекистан')

    def test_country_language_support_en(self):
        url = '/api/locations/countries/?lang=en'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Uzbekistan')

    def test_country_language_support_uz(self):
        url = '/api/locations/countries/?lang=uz'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'O\'zbekiston')

    def test_city_language_support_ru(self):
        url = '/api/locations/cities/?lang=ru'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Ташкент')

    def test_city_language_support_en(self):
        url = '/api/locations/cities/?lang=en'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Tashkent')

    def test_city_language_support_uz(self):
        url = '/api/locations/cities/?lang=uz'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data[0]['name'], 'Toshkent')
