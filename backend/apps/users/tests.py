from django.test import TestCase
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient
from rest_framework import status
from datetime import timedelta
from django.utils import timezone

User = get_user_model()


class UserModelTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Test',
            last_name='User',
            is_driver=False
        )

    def test_user_creation(self):
        self.assertEqual(self.user.phone, '998901234567')
        self.assertEqual(self.user.first_name, 'Test')
        self.assertFalse(self.user.is_driver)
        self.assertFalse(self.user.is_verified)

    def test_user_str(self):
        self.assertEqual(str(self.user), 'Test User (998901234567)')


class UserAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        self.me_url = '/api/auth/me/'

    def test_register_user(self):
        data = {
            'phone': '998901234567',
            'password': 'testpass123',
            'password_confirm': 'testpass123',
            'first_name': 'Test',
            'last_name': 'User',
            'is_driver': False
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_register_with_mismatched_passwords(self):
        data = {
            'phone': '998901234567',
            'password': 'testpass123',
            'password_confirm': 'wrongpass',
            'first_name': 'Test',
            'last_name': 'User'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_user(self):
        User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        data = {
            'phone': '998901234567',
            'password': 'testpass123'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)

    def test_login_invalid_credentials(self):
        data = {
            'phone': '998901234567',
            'password': 'wrongpass'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_me_authenticated(self):
        user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Test',
            last_name='User'
        )
        self.client.force_authenticate(user=user)
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['phone'], '998901234567')

    def test_get_me_unauthenticated(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AdminDriverEarningsStatisticsTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin_user = User.objects.create_user(
            phone='998901234566',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            is_admin=True
        )
        self.driver_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        self.non_admin_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Regular',
            last_name='User',
            is_driver=False
        )
        
        from apps.orders.models import Order, OrderStatus
        from apps.payments.models import Payment
        from apps.advertisements.models import Advertisement
        from apps.locations.models import Country, City
        
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
            client=self.non_admin_user,
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
            client_phone='998901234568'
        )
        from apps.orders.models import Order, OrderStatus
        from apps.payments.models import Payment
        from apps.advertisements.models import Advertisement
        from apps.locations.models import Country, City
        
        self.completed_status = OrderStatus.objects.get(code='completed')
        self.pending_status = OrderStatus.objects.get(code='pending')
        self.in_progress_status = OrderStatus.objects.get(code='in_progress')
        
        self.order1 = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.non_admin_user,
            status=self.completed_status
        )
        self.order2 = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.non_admin_user,
            status=self.pending_status
        )
        self.order3 = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.non_admin_user,
            status=self.in_progress_status
        )
        
        Payment.objects.create(
            user=self.driver_user,
            order=self.order1,
            amount=50000.00,
            currency='UZS',
            payment_method='click',
            payment_status='completed'
        )
        Payment.objects.create(
            user=self.driver_user,
            order=self.order1,
            amount=30000.00,
            currency='UZS',
            payment_method='payme',
            payment_status='completed'
        )

    def test_get_driver_earnings_statistics_as_admin(self):
        self.client.force_authenticate(user=self.admin_user)
        url = '/api/admin/driver-earnings-statistics/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_drivers', response.data)
        self.assertIn('total_earnings', response.data)
        self.assertIn('drivers', response.data)
        self.assertEqual(response.data['total_drivers'], 1)
        self.assertEqual(response.data['total_earnings'], 80000.0)
        self.assertEqual(len(response.data['drivers']), 1)

    def test_get_driver_earnings_statistics_unauthorized(self):
        url = '/api/admin/driver-earnings-statistics/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_get_driver_earnings_statistics_non_admin(self):
        self.client.force_authenticate(user=self.non_admin_user)
        url = '/api/admin/driver-earnings-statistics/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_get_driver_earnings_statistics_with_driver_filter(self):
        self.client.force_authenticate(user=self.admin_user)
        url = f'/api/admin/driver-earnings-statistics/?driver_id={self.driver_user.id}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['drivers']), 1)
        self.assertEqual(response.data['drivers'][0]['driver_id'], self.driver_user.id)

    def test_get_driver_earnings_statistics_with_date_filter(self):
        self.client.force_authenticate(user=self.admin_user)
        from datetime import date, timedelta
        today = date.today()
        yesterday = today - timedelta(days=1)
        url = f'/api/admin/driver-earnings-statistics/?date_from={yesterday}&date_to={today}'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('drivers', response.data)

    def test_get_driver_earnings_statistics_export_csv(self):
        self.client.force_authenticate(user=self.admin_user)
        url = '/api/admin/driver-earnings-statistics/?export=csv'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response['Content-Type'], 'text/csv')
        self.assertIn('attachment', response['Content-Disposition'])

    def test_driver_statistics_includes_correct_data(self):
        self.client.force_authenticate(user=self.admin_user)
        url = '/api/admin/driver-earnings-statistics/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        driver_data = response.data['drivers'][0]
        self.assertEqual(driver_data['driver_id'], self.driver_user.id)
        self.assertEqual(driver_data['driver_phone'], self.driver_user.phone)
        self.assertEqual(driver_data['completed_orders'], 1)
        self.assertEqual(driver_data['total_earnings'], 80000.0)
        self.assertEqual(driver_data['pending_orders'], 1)
        self.assertEqual(driver_data['in_progress_orders'], 1)


class DriverDocumentAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            phone='998901111111',
            password='testpass123',
            first_name='Doc',
            last_name='Driver',
            is_driver=True,
            is_verified=True
        )
        self.dispatcher = User.objects.create_user(
            phone='998902222222',
            password='testpass123',
            first_name='Disp',
            last_name='User',
            is_dispatcher=True
        )
        self.docs_url = '/api/auth/driver-documents/'
        self.monitoring_url = '/api/auth/driver-documents/monitoring/'

    def test_driver_can_create_and_list_documents(self):
        self.client.force_authenticate(user=self.driver)
        payload = {
            'document_type': 'driver_license',
            'document_number': 'DL-555',
            'expires_at': (timezone.now().date() + timedelta(days=10)).isoformat(),
        }
        create_response = self.client.post(self.docs_url, payload, format='json')
        self.assertEqual(create_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(create_response.data['document_type'], 'driver_license')

        list_response = self.client.get(self.docs_url)
        self.assertEqual(list_response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_response.data), 1)

    def test_dispatcher_can_view_document_monitoring(self):
        from apps.users.models import DriverDocument
        DriverDocument.objects.create(
            user=self.driver,
            document_type='passport',
            document_number='PP-100',
            expires_at=timezone.now().date() - timedelta(days=1),
        )
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get(self.monitoring_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response.data['count'], 1)
        self.assertGreaterEqual(response.data['expired_count'], 1)
