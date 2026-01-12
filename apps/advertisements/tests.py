from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from .models import Advertisement
from apps.locations.models import Country, City

User = get_user_model()


class AdvertisementModelTest(TestCase):
    def setUp(self):
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

    def test_advertisement_creation(self):
        ad = Advertisement.objects.create(
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
        self.assertEqual(ad.title_ru, 'Тестовое объявление')
        self.assertEqual(ad.title_en, 'Test Advertisement')
        self.assertEqual(ad.title_uz, 'Test e\'lon')
        self.assertFalse(ad.is_closed)


class AdvertisementAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
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

    def test_create_advertisement(self):
        self.client.force_authenticate(user=self.client_user)
        url = '/api/advertisements/'
        data = {
            'title_ru': 'Тестовое объявление',
            'title_en': 'Test Advertisement',
            'title_uz': 'Test e\'lon',
            'description_ru': 'Тестовое описание',
            'description_en': 'Test description',
            'description_uz': 'Test tavsif',
            'height': '10.5',
            'width': '5.5',
            'length': '2.5',
            'weight': '100.0',
            'departure_address': 'Test departure',
            'departure_country': self.country.id,
            'departure_city': self.city.id,
            'destination_address': 'Test destination',
            'destination_country': self.country.id,
            'destination_city': self.city.id,
            'client_phone': '998901234567'
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('title', response.data)
        self.assertEqual(response.data['title'], 'Тестовое объявление')

    def test_get_advertisements_list(self):
        Advertisement.objects.create(
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
        url = '/api/advertisements/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn('title', response.data[0])

    def test_get_my_advertisements(self):
        self.client.force_authenticate(user=self.client_user)
        Advertisement.objects.create(
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
        url = '/api/advertisements/my/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_advertisement_language_support_ru(self):
        ad = Advertisement.objects.create(
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
        url = f'/api/advertisements/{ad.id}/?lang=ru'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Тестовое объявление')
        self.assertEqual(response.data['description'], 'Тестовое описание')

    def test_advertisement_language_support_en(self):
        ad = Advertisement.objects.create(
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
        url = f'/api/advertisements/{ad.id}/?lang=en'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Advertisement')
        self.assertEqual(response.data['description'], 'Test description')

    def test_advertisement_language_support_uz(self):
        ad = Advertisement.objects.create(
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
        url = f'/api/advertisements/{ad.id}/?lang=uz'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test e\'lon')
        self.assertEqual(response.data['description'], 'Test tavsif')
