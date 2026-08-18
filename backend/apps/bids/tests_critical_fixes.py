from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.bids.models import Bid
from apps.locations.models import City, Country
from apps.orders.models import OrderStatus
from apps.vehicles.models import Vehicle

User = get_user_model()


class BidNegotiationFixTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998902220001',
            password='pass',
            is_driver=False,
        )
        self.driver_user = User.objects.create_user(
            phone='998902220002',
            password='pass',
            is_driver=True,
            is_verified=True,
            document_photos=['doc.jpg'],
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='UB1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test',
            title_en='Test',
            title_uz='Test',
            weight=100,
            proposed_cost=50000,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
        )
        Vehicle.objects.create(
            user=self.driver_user,
            model='Volvo',
            make='Volvo',
            number='01A001AA',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True,
        )
        OrderStatus.objects.get_or_create(
            code='pending',
            defaults={'name_ru': 'Pending', 'name_en': 'Pending', 'name_uz': 'Pending'},
        )
        OrderStatus.objects.get_or_create(
            code='approved_by_client',
            defaults={'name_ru': 'Approved', 'name_en': 'Approved', 'name_uz': 'Approved'},
        )

    def test_client_cannot_accept_until_driver_agrees_to_counter(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[
                {'amount': '45000', 'by': 'driver'},
                {'amount': '47000', 'by': 'client'},
            ],
            last_counter_by='client',
            is_driver_agreed_to_amount=False,
        )
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('not agreed', response.data['error'])

    def test_driver_can_agree_to_client_counter(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[
                {'amount': '45000', 'by': 'driver'},
                {'amount': '47000', 'by': 'client'},
            ],
            last_counter_by='client',
            is_driver_agreed_to_amount=False,
        )
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(f'/api/bids/{bid.id}/agree-counter/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_driver_agreed_to_amount'])

        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_driver_counter_at_client_amount_sets_agreement(self):
        bid = Bid.objects.create(
            advertisement=self.advertisement,
            client=self.client_user,
            driver=self.driver_user,
            proposed_amounts=[
                {'amount': '45000', 'by': 'driver'},
                {'amount': '47000', 'by': 'client'},
            ],
            last_counter_by='client',
            is_driver_agreed_to_amount=False,
        )
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(
            f'/api/bids/{bid.id}/counter-offer/',
            {'amount': 47000},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['is_driver_agreed_to_amount'])

        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid.id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_workflow_client_counter_driver_agree_client_accept(self):
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(
            '/api/bids/',
            {'advertisement': self.advertisement.id, 'proposed_amount': 45000},
            format='json',
        )
        bid_id = response.data['id']

        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(
            f'/api/bids/{bid_id}/counter-offer/',
            {'amount': 47000},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        response = self.api.post(f'/api/bids/{bid_id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(f'/api/bids/{bid_id}/agree-counter/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/bids/{bid_id}/accept-price/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
