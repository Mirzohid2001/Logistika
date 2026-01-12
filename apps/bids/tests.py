from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from .models import Bid
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City

User = get_user_model()


class BidModelTest(TestCase):
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
            proposed_cost=50000.00,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
        )

    def test_bid_creation(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '50000', 'by': 'driver', 'timestamp': None}],
            is_driver_agreed_to_amount=False,
            last_counter_by='driver'
        )
        self.assertEqual(bid.advertisement, self.advertisement)
        self.assertEqual(bid.driver, self.driver_user)
        self.assertFalse(bid.is_accepted_by_client)
        self.assertEqual(bid.last_counter_by, 'driver')


class BidAPITest(TestCase):
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
            proposed_cost=50000.00,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
        )

    def test_create_bid(self):
        self.client.force_authenticate(user=self.driver_user)
        url = '/api/bids/'
        data = {
            'advertisement': self.advertisement.id,
            'proposed_amount': 45000
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['advertisement'], self.advertisement.id)

    def test_get_my_bids(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '50000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.client.force_authenticate(user=self.driver_user)
        url = '/api/bids/my/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)

    def test_get_advertisement_bids(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '50000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/advertisement/{self.advertisement.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)


class BidWorkflowTest(TestCase):
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
            proposed_cost=50000.00,
            departure_address='Test departure',
            departure_country=self.country,
            departure_city=self.city,
            destination_address='Test destination',
            destination_country=self.country,
            destination_city=self.city,
            client_phone='998901234567'
        )

    def test_driver_can_create_bid(self):
        self.client.force_authenticate(user=self.driver_user)
        url = '/api/bids/'
        data = {
            'advertisement': self.advertisement.id,
            'proposed_amount': 45000
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['last_counter_by'], 'driver')
        self.assertEqual(len(response.data['proposed_amounts']), 1)

    def test_client_can_counter_offer(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 47000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['last_counter_by'], 'client')
        self.assertEqual(len(response.data['proposed_amounts']), 2)

    def test_driver_can_counter_offer_after_client(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[
                {'amount': '45000', 'by': 'driver', 'timestamp': None},
                {'amount': '47000', 'by': 'client', 'timestamp': None}
            ],
            last_counter_by='client'
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 46000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['last_counter_by'], 'driver')
        self.assertEqual(len(response.data['proposed_amounts']), 3)

    def test_client_cannot_counter_offer_twice_in_row(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '47000', 'by': 'client', 'timestamp': None}],
            last_counter_by='client'
        )
        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 48000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot make a counter-offer', response.data['error'])

    def test_driver_cannot_counter_offer_twice_in_row(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 44000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('cannot make a counter-offer', response.data['error'])

    def test_cannot_counter_offer_rejected_bid(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver',
            is_rejected_by_client=True
        )
        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 47000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_cannot_counter_offer_accepted_bid(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver',
            is_accepted_by_client=True
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/bids/{bid.id}/counter-offer/'
        data = {'amount': 44000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_driver_can_reject_bid(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/bids/{bid.id}/reject/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bid.refresh_from_db()
        self.assertTrue(bid.is_rejected_by_driver)

    def test_workflow_complete_cycle(self):
        self.client.force_authenticate(user=self.driver_user)
        url = '/api/bids/'
        data = {
            'advertisement': self.advertisement.id,
            'proposed_amount': 45000
        }
        response = self.client.post(url, data, format='json')
        bid_id = response.data['id']

        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/{bid_id}/counter-offer/'
        data = {'amount': 47000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['last_counter_by'], 'client')

        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/bids/{bid_id}/counter-offer/'
        data = {'amount': 46000}
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['last_counter_by'], 'driver')

        self.client.force_authenticate(user=self.client_user)
        url = f'/api/bids/{bid_id}/accept-price/'
        response = self.client.post(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        bid = Bid.objects.get(id=bid_id)
        self.assertTrue(bid.is_accepted_by_client)

    def test_get_current_amount(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[
                {'amount': '45000', 'by': 'driver', 'timestamp': None},
                {'amount': '47000', 'by': 'client', 'timestamp': None},
                {'amount': '46000', 'by': 'driver', 'timestamp': None}
            ],
            last_counter_by='driver'
        )
        current_amount = bid.get_current_amount()
        self.assertEqual(current_amount, '46000')

    def test_can_counter_offer_methods(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[{'amount': '45000', 'by': 'driver', 'timestamp': None}],
            last_counter_by='driver'
        )
        self.assertTrue(bid.can_counter_offer_by_client())
        self.assertFalse(bid.can_counter_offer_by_driver())

        bid.last_counter_by = 'client'
        bid.save()
        self.assertTrue(bid.can_counter_offer_by_driver())
        self.assertFalse(bid.can_counter_offer_by_client())

    def test_cannot_create_multiple_active_bids(self):
        self.client.force_authenticate(user=self.driver_user)
        url = '/api/bids/'
        data = {
            'advertisement': self.advertisement.id,
            'proposed_amount': 45000
        }
        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        response = self.client.post(url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('already have an active bid', response.data['error'])
