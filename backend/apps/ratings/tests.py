from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from apps.orders.models import Order, OrderStatus
from apps.ratings.models import Complaint

User = get_user_model()


class ComplaintAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234580',
            password='testpass123',
            first_name='Client',
            last_name='Complaint',
            is_driver=False,
        )
        self.driver_user = User.objects.create_user(
            phone='998901234581',
            password='testpass123',
            first_name='Driver',
            last_name='Complaint',
            is_driver=True,
        )
        self.country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={
                'name_ru': 'Узбекистан',
                'name_en': 'Uzbekistan',
                'name_uz': "O'zbekiston",
            },
        )
        self.city, _ = City.objects.get_or_create(
            country=self.country,
            name_en='Samarkand',
            defaults={
                'name_ru': 'Самарканд',
                'name_uz': 'Samarqand',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Complaint test',
            title_en='Complaint test',
            title_uz='Complaint test',
            description_ru='',
            description_en='',
            description_uz='',
            weight=50,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
            proposed_cost=1_000_000,
        )
        self.in_transit_status = OrderStatus.objects.get(code='in_transit')
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_transit_status,
        )

    def test_client_can_file_complaint_against_driver(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            '/api/ratings/complaints/create/',
            {
                'order_id': self.order.id,
                'to_user_id': self.driver_user.id,
                'category': 'payment',
                'description': 'Driver asked extra money outside chat agreement.',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Complaint.objects.count(), 1)
        complaint = Complaint.objects.get()
        self.assertEqual(complaint.from_user, self.client_user)
        self.assertEqual(complaint.to_user, self.driver_user)
        self.assertEqual(complaint.status, 'pending')

    def test_duplicate_complaint_rejected(self):
        self.client.force_authenticate(user=self.client_user)
        payload = {
            'order_id': self.order.id,
            'to_user_id': self.driver_user.id,
            'category': 'payment',
            'description': 'First complaint about payment issue.',
        }
        first = self.client.post('/api/ratings/complaints/create/', payload, format='json')
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        second = self.client.post('/api/ratings/complaints/create/', payload, format='json')
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(Complaint.objects.count(), 1)

    @patch('apps.ratings.complaint_notifications.create_notification')
    def test_staff_notified_on_complaint_create(self, mock_notify):
        staff = User.objects.create_user(
            phone='998901234598',
            password='testpass123',
            is_dispatcher=True,
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            '/api/ratings/complaints/create/',
            {
                'order_id': self.order.id,
                'to_user_id': self.driver_user.id,
                'category': 'behavior',
                'description': 'Staff should be notified about this complaint.',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        notified_users = {call.kwargs['user'].id for call in mock_notify.call_args_list}
        self.assertIn(staff.id, notified_users)

    def test_driver_can_file_complaint_against_client(self):
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(
            '/api/ratings/complaints/create/',
            {
                'order_id': self.order.id,
                'to_user_id': self.client_user.id,
                'category': 'behavior',
                'description': 'Client was rude during unloading.',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_user_stats_include_complaints(self):
        Complaint.objects.create(
            order=self.order,
            from_user=self.client_user,
            to_user=self.driver_user,
            category='other',
            description='Test complaint for stats endpoint.',
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get(f'/api/ratings/user/{self.driver_user.id}/stats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['complaints_received'], 1)
        self.assertEqual(response.data['complaints_pending'], 1)

    def test_staff_can_list_and_resolve_complaint(self):
        complaint = Complaint.objects.create(
            order=self.order,
            from_user=self.client_user,
            to_user=self.driver_user,
            category='payment',
            description='Staff resolve flow test complaint.',
        )
        staff = User.objects.create_user(
            phone='998901234599',
            password='testpass123',
            first_name='Staff',
            last_name='Moderator',
            is_dispatcher=True,
        )
        self.client.force_authenticate(user=staff)
        list_response = self.client.get('/api/ratings/complaints/staff/?status=pending')
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)

        resolve_response = self.client.post(
            f'/api/ratings/complaints/{complaint.id}/resolve/',
            {'status': 'resolved', 'admin_notes': 'Verified with both parties.'},
            format='json',
        )
        self.assertEqual(resolve_response.status_code, status.HTTP_200_OK)
        complaint.refresh_from_db()
        self.assertEqual(complaint.status, 'resolved')
        self.assertEqual(complaint.admin_notes, 'Verified with both parties.')
