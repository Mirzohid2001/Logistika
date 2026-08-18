from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement, AdvertisementExecution
from apps.bids.models import Bid
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.orders.services import driver_has_active_order

User = get_user_model()


class MarketplaceRecoveryTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(phone='998903330001', password='pass')
        self.driver = User.objects.create_user(
            phone='998903330002',
            password='pass',
            is_driver=True,
            is_verified=True,
        )
        self.other_driver = User.objects.create_user(
            phone='998903330003',
            password='pass',
            is_driver=True,
            is_verified=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='MR1',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Recovery',
            title_en='Recovery',
            title_uz='Recovery',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('400000'),
            is_closed=True,
        )
        self.pending_status = OrderStatus.objects.get(code='pending')
        self.order = Order.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            client=self.client_user,
            status=self.pending_status,
        )
        self.bid = Bid.objects.create(
            advertisement=self.ad,
            client=self.client_user,
            driver=self.driver,
            proposed_amounts=[{'amount': '400000', 'by': 'driver'}],
            is_accepted_by_client=True,
            is_rejected_by_client=False,
        )
        Bid.objects.create(
            advertisement=self.ad,
            client=self.client_user,
            driver=self.other_driver,
            proposed_amounts=[{'amount': '380000', 'by': 'driver'}],
            is_rejected_by_client=True,
        )
        AdvertisementExecution.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            proposed_cost=Decimal('400000'),
        )

    def test_decline_reopens_marketplace_and_resets_bids(self):
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/orders/{self.order.id}/decline/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ad.refresh_from_db()
        self.assertFalse(self.ad.is_closed)
        self.assertFalse(AdvertisementExecution.objects.filter(advertisement=self.ad).exists())

        self.bid.refresh_from_db()
        self.assertFalse(self.bid.is_accepted_by_client)
        self.assertFalse(self.bid.is_rejected_by_client)

        other_bid = Bid.objects.get(driver=self.other_driver, advertisement=self.ad)
        self.assertFalse(other_bid.is_rejected_by_client)

    def test_reject_reopens_marketplace(self):
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/orders/{self.order.id}/reject/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        self.ad.refresh_from_db()
        self.assertFalse(self.ad.is_closed)
        self.assertFalse(driver_has_active_order(self.driver.id))

    def test_stopped_order_not_active_for_driver(self):
        stopped_status, _ = OrderStatus.objects.get_or_create(
            code='stopped',
            defaults={'name_ru': 'Stopped', 'name_en': 'Stopped', 'name_uz': 'Stopped'},
        )
        self.order.status = stopped_status
        self.order.save(update_fields=['status'])
        self.assertFalse(driver_has_active_order(self.driver.id))
