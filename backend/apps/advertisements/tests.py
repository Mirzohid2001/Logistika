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


class AdvertisementAcceptViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver1 = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='One',
            is_driver=True
        )
        self.driver2 = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Driver',
            last_name='Two',
            is_driver=True
        )
        self.driver3 = User.objects.create_user(
            phone='998901234570',
            password='testpass123',
            first_name='Driver',
            last_name='Three',
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

    def test_accept_advertisement_rejects_other_bids(self):
        from apps.bids.models import Bid
        
        bid1 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver1,
            proposed_amounts=[{'amount': '100000', 'by': 'driver'}],
            last_counter_by='driver'
        )
        bid2 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver2,
            proposed_amounts=[{'amount': '120000', 'by': 'driver'}],
            last_counter_by='driver'
        )
        bid3 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver3,
            proposed_amounts=[{'amount': '150000', 'by': 'driver'}],
            last_counter_by='driver'
        )
        
        self.client.force_authenticate(user=self.driver1)
        url = f'/api/advertisements/{self.advertisement.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        bid1.refresh_from_db()
        bid2.refresh_from_db()
        bid3.refresh_from_db()
        
        self.assertFalse(bid1.is_rejected_by_client)
        self.assertTrue(bid2.is_rejected_by_client)
        self.assertTrue(bid3.is_rejected_by_client)
        
        self.advertisement.refresh_from_db()
        self.assertTrue(self.advertisement.is_closed)

    def test_accept_advertisement_does_not_reject_already_rejected_bids(self):
        from apps.bids.models import Bid
        
        bid1 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver1,
            proposed_amounts=[{'amount': '100000', 'by': 'driver'}],
            last_counter_by='driver'
        )
        bid2 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver2,
            proposed_amounts=[{'amount': '120000', 'by': 'driver'}],
            last_counter_by='driver',
            is_rejected_by_client=True
        )
        
        self.client.force_authenticate(user=self.driver1)
        url = f'/api/advertisements/{self.advertisement.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        bid2.refresh_from_db()
        self.assertTrue(bid2.is_rejected_by_client)

    def test_accept_advertisement_creates_order(self):
        from apps.orders.models import Order
        
        self.client.force_authenticate(user=self.driver1)
        url = f'/api/advertisements/{self.advertisement.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        order = Order.objects.filter(
            advertisement=self.advertisement,
            driver=self.driver1
        ).first()
        
        self.assertIsNotNone(order)
        self.assertEqual(order.client, self.client_user)
        self.assertEqual(order.driver, self.driver1)

    def test_accept_advertisement_closes_advertisement(self):
        self.assertFalse(self.advertisement.is_closed)
        
        self.client.force_authenticate(user=self.driver1)
        url = f'/api/advertisements/{self.advertisement.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        
        self.advertisement.refresh_from_db()
        self.assertTrue(self.advertisement.is_closed)

    def test_cannot_accept_already_closed_advertisement(self):
        self.advertisement.is_closed = True
        self.advertisement.save()
        
        self.client.force_authenticate(user=self.driver1)
        url = f'/api/advertisements/{self.advertisement.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_accept_own_advertisement(self):
        driver_who_is_client = User.objects.create_user(
            phone='998901234571',
            password='testpass123',
            first_name='Driver',
            last_name='Client',
            is_driver=True
        )
        advertisement_owned_by_driver = Advertisement.objects.create(
            client=driver_who_is_client,
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
            client_phone='998901234571'
        )
        
        self.client.force_authenticate(user=driver_who_is_client)
        url = f'/api/advertisements/{advertisement_owned_by_driver.id}/accept/'
        response = self.client.post(url)
        
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot accept your own', response.data['error'].lower())
