from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from decimal import Decimal
from .models import UpdateLog
from apps.orders.models import Order, OrderStatus, OrderLocationTrack
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from apps.payments.models import Payment

User = get_user_model()


class UpdaterModelTest(TestCase):
    def setUp(self):
        self.updater = User.objects.create_user(
            phone='998901234560',
            password='testpass123',
            first_name='Updater',
            last_name='User',
            is_updater=True
        )
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_client=True
        )
        self.driver = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True,
            is_verified=True
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
            weight=1000,
            departure_city=self.city,
            destination_city=self.city,
            departure_address='Test address 1',
            destination_address='Test address 2',
            proposed_cost=500000
        )
        self.order_status = OrderStatus.objects.create(
            code='pending',
            name_ru='Ожидание',
            name_en='Pending',
            name_uz='Kutilmoqda'
        )
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.order_status
        )

    def test_update_log_creation(self):
        log = UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='status',
            old_value={'status': 'pending'},
            new_value={'status': 'in_progress'},
            description='Status updated'
        )
        self.assertEqual(log.updater, self.updater)
        self.assertEqual(log.order, self.order)
        self.assertEqual(log.update_type, 'status')
        self.assertEqual(log.old_value, {'status': 'pending'})
        self.assertEqual(log.new_value, {'status': 'in_progress'})
        self.assertEqual(log.description, 'Status updated')


class UpdaterAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.updater = User.objects.create_user(
            phone='998901234560',
            password='testpass123',
            first_name='Updater',
            last_name='User',
            is_updater=True
        )
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_client=True
        )
        self.driver = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True,
            is_verified=True
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
            weight=1000,
            departure_city=self.city,
            destination_city=self.city,
            departure_address='Test address 1',
            destination_address='Test address 2',
            proposed_cost=500000
        )
        self.pending_status = OrderStatus.objects.create(
            code='pending',
            name_ru='Ожидание',
            name_en='Pending',
            name_uz='Kutilmoqda'
        )
        self.in_progress_status = OrderStatus.objects.create(
            code='in_progress',
            name_ru='В процессе',
            name_en='In Progress',
            name_uz='Jarayonda'
        )
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.pending_status
        )

    def test_updater_dashboard_unauthorized(self):
        response = self.client.get('/api/updater/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_updater_dashboard_authorized(self):
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('pending_updates', response.data)
        self.assertIn('active_tracking', response.data)
        self.assertIn('today_updates', response.data)
        self.assertIn('week_updates', response.data)

    def test_updater_pending_updates(self):
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/pending-updates/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_updater_update_status(self):
        self.client.force_authenticate(user=self.updater)
        data = {
            'status_code': 'in_progress',
            'description': 'Status updated by updater'
        }
        response = self.client.post(f'/api/updater/orders/{self.order.id}/update-status/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.order.refresh_from_db()
        self.assertEqual(self.order.status.code, 'in_progress')
        
        log = UpdateLog.objects.filter(
            order=self.order,
            updater=self.updater,
            update_type='status'
        ).first()
        self.assertIsNotNone(log)
        self.assertEqual(log.new_value['status'], 'in_progress')

    def test_updater_update_status_invalid(self):
        self.client.force_authenticate(user=self.updater)
        data = {
            'status_code': 'invalid_status',
            'description': 'Invalid status'
        }
        response = self.client.post(f'/api/updater/orders/{self.order.id}/update-status/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_updater_update_location(self):
        self.client.force_authenticate(user=self.updater)
        data = {
            'lat': Decimal('41.3111'),
            'lng': Decimal('69.2797'),
            'description': 'Location updated'
        }
        response = self.client.post(f'/api/updater/orders/{self.order.id}/update-location/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.order.refresh_from_db()
        self.assertEqual(float(self.order.current_location_lat), 41.3111)
        self.assertEqual(float(self.order.current_location_lng), 69.2797)
        
        track = OrderLocationTrack.objects.filter(order=self.order).first()
        self.assertIsNotNone(track)
        
        log = UpdateLog.objects.filter(
            order=self.order,
            updater=self.updater,
            update_type='location'
        ).first()
        self.assertIsNotNone(log)

    def test_updater_update_payment(self):
        payment = Payment.objects.create(
            user=self.client_user,
            order=self.order,
            amount=Decimal('500000'),
            currency='UZS',
            payment_method='click',
            payment_status='pending'
        )
        self.client.force_authenticate(user=self.updater)
        data = {
            'payment_status': 'completed',
            'description': 'Payment updated'
        }
        response = self.client.post(f'/api/updater/orders/{self.order.id}/update-payment/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        payment.refresh_from_db()
        self.assertEqual(payment.payment_status, 'completed')
        
        log = UpdateLog.objects.filter(
            order=self.order,
            updater=self.updater,
            update_type='payment'
        ).first()
        self.assertIsNotNone(log)

    def test_updater_bulk_update(self):
        self.client.force_authenticate(user=self.updater)
        data = {
            'status_code': 'in_progress',
            'lat': Decimal('41.3111'),
            'lng': Decimal('69.2797'),
            'description': 'Bulk update'
        }
        response = self.client.post(f'/api/updater/orders/{self.order.id}/bulk-update/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        self.order.refresh_from_db()
        self.assertEqual(self.order.status.code, 'in_progress')
        self.assertEqual(float(self.order.current_location_lat), 41.3111)
        self.assertEqual(float(self.order.current_location_lng), 69.2797)
        
        log = UpdateLog.objects.filter(
            order=self.order,
            updater=self.updater,
            update_type='other'
        ).first()
        self.assertIsNotNone(log)

    def test_updater_tracking(self):
        OrderLocationTrack.objects.create(
            order=self.order,
            lat=Decimal('41.3111'),
            lng=Decimal('69.2797')
        )
        self.client.force_authenticate(user=self.updater)
        response = self.client.get(f'/api/updater/orders/{self.order.id}/tracking/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('order', response.data)
        self.assertIn('tracks', response.data)
        self.assertTrue(len(response.data['tracks']) > 0)

    def test_updater_active_tracking(self):
        self.order.status = self.in_progress_status
        self.order.current_location_lat = Decimal('41.3111')
        self.order.current_location_lng = Decimal('69.2797')
        self.order.save()
        
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/active-tracking/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) > 0)

    def test_updater_logs(self):
        UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='status',
            old_value={'status': 'pending'},
            new_value={'status': 'in_progress'},
            description='Test log'
        )
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/logs/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) > 0)

    def test_updater_logs_filter_by_order(self):
        UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='status',
            old_value={'status': 'pending'},
            new_value={'status': 'in_progress'}
        )
        self.client.force_authenticate(user=self.updater)
        response = self.client.get(f'/api/updater/logs/?order_id={self.order.id}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_updater_logs_filter_by_type(self):
        UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='status',
            old_value={'status': 'pending'},
            new_value={'status': 'in_progress'}
        )
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/logs/?update_type=status')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_updater_statistics(self):
        UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='status',
            old_value={'status': 'pending'},
            new_value={'status': 'in_progress'}
        )
        UpdateLog.objects.create(
            updater=self.updater,
            order=self.order,
            update_type='location',
            old_value={'lat': None, 'lng': None},
            new_value={'lat': 41.3111, 'lng': 69.2797}
        )
        self.client.force_authenticate(user=self.updater)
        response = self.client.get('/api/updater/statistics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_updates', response.data)
        self.assertIn('today_updates', response.data)
        self.assertIn('week_updates', response.data)
        self.assertIn('month_updates', response.data)
        self.assertIn('status_updates', response.data)
        self.assertIn('location_updates', response.data)

    def test_non_updater_access_denied(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get('/api/updater/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_updater_update_nonexistent_order(self):
        self.client.force_authenticate(user=self.updater)
        data = {'status_code': 'in_progress'}
        response = self.client.post('/api/updater/orders/99999/update-status/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
