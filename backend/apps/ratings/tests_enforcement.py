from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.ratings.models import Complaint
from apps.users.enforcement import user_is_marketplace_banned

User = get_user_model()


class ComplaintEnforcementTest(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.staff = User.objects.create_user(
            phone='998901200001', password='pass', is_staff=True,
        )
        self.client_user = User.objects.create_user(phone='998901200002', password='pass', is_client=True)
        self.driver_user = User.objects.create_user(
            phone='998901200003', password='pass', is_driver=True, is_client=False, is_verified=True,
        )
        self.country = Country.objects.create(
            name_ru='UZ', name_en='UZ', name_uz='UZ', code='C1',
        )
        self.city = City.objects.create(
            country=self.country, name_ru='T', name_en='T', name_uz='T',
        )
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='T', title_en='T', title_uz='T',
            description_ru='', description_en='', description_uz='',
            weight=100,
            departure_city=self.city,
            destination_city=self.city,
            departure_address='A',
            destination_address='B',
        )
        status_obj = OrderStatus.objects.get(code='completed')
        self.order = Order.objects.create(
            advertisement=ad,
            client=self.client_user,
            driver=self.driver_user,
            status=status_obj,
        )
        self.complaint = Complaint.objects.create(
            order=self.order,
            from_user=self.client_user,
            to_user=self.driver_user,
            category='behavior',
            description='Test complaint description here',
        )

    def test_resolve_with_suspend_action(self):
        self.api.force_authenticate(user=self.staff)
        response = self.api.post(
            f'/api/ratings/complaints/{self.complaint.id}/resolve/',
            {'status': 'resolved', 'action': 'suspend_7'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.driver_user.refresh_from_db()
        self.assertTrue(user_is_marketplace_banned(self.driver_user))
        self.assertIsNotNone(self.driver_user.suspended_until)

    def test_block_prevents_bid_create(self):
        self.driver_user.is_blocked = True
        self.driver_user.save(update_fields=['is_blocked'])
        self.api.force_authenticate(user=self.driver_user)
        response = self.api.post(
            '/api/bids/',
            {'advertisement': self.order.advertisement_id, 'proposed_amount': '500000'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
