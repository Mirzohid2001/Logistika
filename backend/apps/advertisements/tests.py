from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import Advertisement
from apps.locations.models import Country, City
from apps.orders.models import OrderStatus
from apps.vehicles.models import Vehicle

User = get_user_model()


def create_test_ad(client, city, **extra):
    data = {
        'client': client,
        'title_ru': 'Тестовое объявление',
        'title_en': 'Test Advertisement',
        'title_uz': 'Test e\'lon',
        'description_ru': 'Тестовое описание',
        'description_en': 'Test description',
        'description_uz': 'Test tavsif',
        'weight': Decimal('100'),
        'volume_m3': Decimal('10.5'),
        'departure_address': 'Test departure',
        'departure_city': city,
        'destination_address': 'Test destination',
        'destination_city': city,
    }
    data.update(extra)
    return Advertisement.objects.create(**data)


def ad_post_payload(city, **extra):
    data = {
        'title_ru': 'Тестовое объявление',
        'title_en': 'Test Advertisement',
        'title_uz': 'Test e\'lon',
        'description_ru': 'Тестовое описание',
        'description_en': 'Test description',
        'description_uz': 'Test tavsif',
        'weight': '100.0',
        'volume_m3': '10.5',
        'departure_address': 'Test departure',
        'departure_city': city.id,
        'destination_address': 'Test destination',
        'destination_city': city.id,
    }
    data.update(extra)
    return data


class AdvertisementModelTest(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False,
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='A1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent',
        )

    def test_advertisement_creation(self):
        ad = create_test_ad(self.client_user, self.city)
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
            is_driver=False,
            company_inn='123456789',
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='A2',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent',
        )

    def test_create_advertisement_requires_inn(self):
        legacy_client = User.objects.create_user(
            phone='998901239999',
            password='testpass123',
            first_name='Legacy',
            last_name='Client',
            is_driver=False,
        )
        self.client.force_authenticate(user=legacy_client)
        response = self.client.post(
            '/api/advertisements/',
            ad_post_payload(self.city),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data.get('code'), 'company_inn_required')

    def test_create_advertisement(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            '/api/advertisements/',
            ad_post_payload(self.city),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('title', response.data)
        self.assertEqual(response.data['title'], 'Тестовое объявление')

    def test_get_advertisements_list(self):
        create_test_ad(self.client_user, self.city)
        response = self.client.get('/api/advertisements/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertIn('title', response.data[0])

    def test_get_my_advertisements(self):
        self.client.force_authenticate(user=self.client_user)
        create_test_ad(self.client_user, self.city)
        response = self.client.get('/api/advertisements/my/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_advertisement_language_support_ru(self):
        ad = create_test_ad(self.client_user, self.city)
        response = self.client.get(f'/api/advertisements/{ad.id}/?lang=ru')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Тестовое объявление')
        self.assertEqual(response.data['description'], 'Тестовое описание')

    def test_advertisement_language_support_en(self):
        ad = create_test_ad(self.client_user, self.city)
        response = self.client.get(f'/api/advertisements/{ad.id}/?lang=en')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Advertisement')
        self.assertEqual(response.data['description'], 'Test description')

    def test_advertisement_language_support_uz(self):
        ad = create_test_ad(self.client_user, self.city)
        response = self.client.get(f'/api/advertisements/{ad.id}/?lang=uz')
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
            is_driver=False,
        )
        self.driver1 = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='One',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.driver2 = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Driver',
            last_name='Two',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.driver3 = User.objects.create_user(
            phone='998901234570',
            password='testpass123',
            first_name='Driver',
            last_name='Three',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='A3',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.advertisement = create_test_ad(self.client_user, self.city)
        OrderStatus.objects.get_or_create(
            code='pending',
            defaults={'name_ru': 'Pending', 'name_en': 'Pending', 'name_uz': 'Pending'},
        )
        Vehicle.objects.create(
            user=self.driver1,
            model='Volvo',
            make='Volvo',
            number='01A001AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )

    def test_accept_advertisement_rejects_other_bids(self):
        from apps.bids.models import Bid

        bid1 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver1,
            proposed_amounts=[{'amount': '100000', 'by': 'driver'}],
            last_counter_by='driver',
        )
        bid2 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver2,
            proposed_amounts=[{'amount': '120000', 'by': 'driver'}],
            last_counter_by='driver',
        )
        bid3 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver3,
            proposed_amounts=[{'amount': '150000', 'by': 'driver'}],
            last_counter_by='driver',
        )

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

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

        Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver1,
            proposed_amounts=[{'amount': '100000', 'by': 'driver'}],
            last_counter_by='driver',
        )
        bid2 = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver2,
            proposed_amounts=[{'amount': '120000', 'by': 'driver'}],
            last_counter_by='driver',
            is_rejected_by_client=True,
        )

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        bid2.refresh_from_db()
        self.assertTrue(bid2.is_rejected_by_client)

    def test_accept_advertisement_creates_order(self):
        from apps.orders.models import Order

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        order = Order.objects.filter(
            advertisement=self.advertisement,
            driver=self.driver1,
        ).first()

        self.assertIsNotNone(order)
        self.assertEqual(order.client, self.client_user)
        self.assertEqual(order.driver, self.driver1)

    def test_accept_advertisement_closes_advertisement(self):
        self.assertFalse(self.advertisement.is_closed)

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        self.advertisement.refresh_from_db()
        self.assertTrue(self.advertisement.is_closed)

    def test_cannot_accept_already_closed_advertisement(self):
        self.advertisement.is_closed = True
        self.advertisement.save()

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_cannot_delete_advertisement_with_active_order(self):
        from apps.orders.models import Order

        self.client.force_authenticate(user=self.driver1)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.filter(advertisement=self.advertisement, driver=self.driver1).first()
        self.assertIsNotNone(order)

        self.client.force_authenticate(user=self.client_user)
        response = self.client.delete(f'/api/advertisements/{self.advertisement.id}/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(Advertisement.objects.filter(pk=self.advertisement.id).exists())

    def test_cannot_accept_own_advertisement(self):
        driver_who_is_client = User.objects.create_user(
            phone='998901234571',
            password='testpass123',
            first_name='Driver',
            last_name='Client',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        Vehicle.objects.create(
            user=driver_who_is_client,
            model='Volvo',
            make='Volvo',
            number='01A003AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )
        advertisement_owned_by_driver = create_test_ad(driver_who_is_client, self.city)

        self.client.force_authenticate(user=driver_who_is_client)
        response = self.client.post(f'/api/advertisements/{advertisement_owned_by_driver.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot accept your own', response.data['error'].lower())
