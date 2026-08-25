from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from .models import DispatcherAssignment, DispatcherNote, DispatcherExceptionAction
from apps.orders.models import Order, OrderStatus
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from apps.vehicles.models import Vehicle
from apps.users.models import DriverDocument

User = get_user_model()


class DispatcherModelTest(TestCase):
    def setUp(self):
        self.dispatcher = User.objects.create_user(
            phone='998901234560',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True
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
            name_ru='Узбекистан', name_en='Uzbekistan', name_uz='O\'zbekiston', code='D1',
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
        self.order_status, _ = OrderStatus.objects.get_or_create(
            code='pending',
            defaults={
                'name_ru': 'Ожидание',
                'name_en': 'Pending',
                'name_uz': 'Kutilmoqda'
            }
        )
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.order_status
        )
        Vehicle.objects.create(
            user=self.driver,
            model='MAN TGX',
            make='MAN',
            number='01B456CD',
            cargo_volume=45,
            load_capacity=6000,
            is_verified=True
        )
        Vehicle.objects.create(
            user=self.driver,
            model='Actros',
            make='Mercedes',
            number='01A123BC',
            cargo_volume=40,
            load_capacity=5000,
            is_verified=True
        )

    def test_dispatcher_assignment_creation(self):
        assignment = DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver,
            notes='Test assignment'
        )
        self.assertEqual(assignment.dispatcher, self.dispatcher)
        self.assertEqual(assignment.order, self.order)
        self.assertEqual(assignment.assigned_driver, self.driver)
        self.assertEqual(assignment.status, 'assigned')
        self.assertEqual(assignment.notes, 'Test assignment')

    def test_dispatcher_note_creation(self):
        note = DispatcherNote.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            note='Test note'
        )
        self.assertEqual(note.dispatcher, self.dispatcher)
        self.assertEqual(note.order, self.order)
        self.assertEqual(note.note, 'Test note')


class DispatcherAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.dispatcher = User.objects.create_user(
            phone='998901234560',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True
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
            name_ru='Узбекистан', name_en='Uzbekistan', name_uz='O\'zbekiston', code='D2',
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
        self.order_status, _ = OrderStatus.objects.get_or_create(
            code='pending',
            defaults={
                'name_ru': 'Ожидание',
                'name_en': 'Pending',
                'name_uz': 'Kutilmoqda'
            }
        )
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.order_status
        )
        Vehicle.objects.create(
            user=self.driver,
            model='Volvo FH',
            make='Volvo',
            number='01C789DE',
            cargo_volume=50,
            load_capacity=7000,
            is_verified=True
        )

    def test_dispatcher_dashboard_unauthorized(self):
        response = self.client.get('/api/dispatcher/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_dispatcher_dashboard_authorized(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('total_orders', response.data)
        self.assertIn('active_orders', response.data)
        self.assertIn('pending_orders', response.data)

    def test_dispatcher_orders_list(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/orders/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_dispatcher_orders_filter_by_status(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/orders/?status=pending')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_dispatcher_orders_search(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/orders/?search=Test')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_dispatcher_order_detail(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get(f'/api/dispatcher/orders/{self.order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], self.order.id)
        self.assertIn('assignments', response.data)
        self.assertIn('notes', response.data)

    def test_dispatcher_assign_driver(self):
        self.client.force_authenticate(user=self.dispatcher)
        data = {
            'order_id': self.order.id,
            'driver_id': self.driver.id,
            'notes': 'Test assignment'
        }
        response = self.client.post(f'/api/dispatcher/orders/{self.order.id}/assign/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['assigned_driver']['id'], self.driver.id)
        
        assignment = DispatcherAssignment.objects.filter(
            order=self.order,
            dispatcher=self.dispatcher
        ).first()
        self.assertIsNotNone(assignment)
        self.assertEqual(assignment.assigned_driver, self.driver)

    def test_dispatcher_assign_rejects_in_transit_order(self):
        in_transit, _ = OrderStatus.objects.get_or_create(
            code='in_transit',
            defaults={'name_ru': 'In transit', 'name_en': 'In transit', 'name_uz': "Yo'lda"},
        )
        self.order.status = in_transit
        self.order.save(update_fields=['status'])
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.post(
            f'/api/dispatcher/orders/{self.order.id}/assign/',
            {'driver_id': self.driver.id, 'notes': 'Too late'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_dispatcher_assign_unverified_driver(self):
        unverified_driver = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Unverified',
            last_name='Driver',
            is_driver=True,
            is_verified=False
        )
        self.client.force_authenticate(user=self.dispatcher)
        data = {
            'order_id': self.order.id,
            'driver_id': unverified_driver.id,
            'notes': 'Test assignment'
        }
        response = self.client.post(f'/api/dispatcher/orders/{self.order.id}/assign/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('error', response.data)

    def test_dispatcher_reassign_driver(self):
        assignment = DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver
        )
        new_driver = User.objects.create_user(
            phone='998901234570',
            password='testpass123',
            first_name='New',
            last_name='Driver',
            is_driver=True,
            is_verified=True
        )
        self.client.force_authenticate(user=self.dispatcher)
        data = {
            'driver_id': new_driver.id,
            'notes': 'Reassignment'
        }
        response = self.client.post(f'/api/dispatcher/orders/{assignment.id}/reassign/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        assignment.refresh_from_db()
        self.assertEqual(assignment.assigned_driver, new_driver)
        self.assertEqual(assignment.status, 'reassigned')

    def test_dispatcher_cancel_order(self):
        assignment = DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver
        )
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.post(f'/api/dispatcher/orders/{self.order.id}/cancel/', format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        assignment.refresh_from_db()
        self.assertEqual(assignment.status, 'cancelled')

    def test_dispatcher_add_note(self):
        self.client.force_authenticate(user=self.dispatcher)
        data = {'note': 'Test note'}
        response = self.client.post(f'/api/dispatcher/orders/{self.order.id}/note/', data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['note'], 'Test note')
        
        note = DispatcherNote.objects.filter(
            order=self.order,
            dispatcher=self.dispatcher
        ).first()
        self.assertIsNotNone(note)
        self.assertEqual(note.note, 'Test note')

    def test_dispatcher_get_drivers(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/drivers/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)
        self.assertTrue(len(response.data) > 0)

    def test_dispatcher_get_clients(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/clients/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)

    def test_dispatcher_statistics(self):
        DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver
        )
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/statistics/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['scope'], 'my')
        self.assertIn('total_assignments', response.data)
        self.assertIn('today_assignments', response.data)
        self.assertIn('week_assignments', response.data)
        self.assertIn('month_assignments', response.data)

    def test_dispatcher_statistics_scope_all(self):
        second_dispatcher = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Dispatcher2',
            last_name='User',
            is_dispatcher=True
        )
        DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver
        )
        second_order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.order_status
        )
        DispatcherAssignment.objects.create(
            dispatcher=second_dispatcher,
            order=second_order,
            assigned_driver=self.driver
        )
        self.client.force_authenticate(user=self.dispatcher)
        response_my = self.client.get('/api/dispatcher/statistics/?scope=my')
        response_all = self.client.get('/api/dispatcher/statistics/?scope=all')
        self.assertEqual(response_my.status_code, status.HTTP_200_OK)
        self.assertEqual(response_all.status_code, status.HTTP_200_OK)
        self.assertEqual(response_my.data['scope'], 'my')
        self.assertEqual(response_all.data['scope'], 'all')
        self.assertEqual(response_my.data['total_assignments'], 1)
        self.assertEqual(response_all.data['total_assignments'], 2)

    def test_dispatcher_statistics_scope_invalid(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/statistics/?scope=wrong')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_dispatcher_statistics_date_range(self):
        old_assignment = DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=self.order,
            assigned_driver=self.driver
        )
        old_assignment.assigned_at = timezone.now() - timedelta(days=40)
        old_assignment.save(update_fields=['assigned_at'])

        recent_order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver,
            client=self.client_user,
            status=self.order_status
        )
        recent_assignment = DispatcherAssignment.objects.create(
            dispatcher=self.dispatcher,
            order=recent_order,
            assigned_driver=self.driver
        )
        recent_assignment.assigned_at = timezone.now() - timedelta(days=2)
        recent_assignment.save(update_fields=['assigned_at'])

        self.client.force_authenticate(user=self.dispatcher)
        date_from = (timezone.now().date() - timedelta(days=7)).strftime('%Y-%m-%d')
        date_to = timezone.now().date().strftime('%Y-%m-%d')
        response = self.client.get(f'/api/dispatcher/statistics/?scope=my&date_from={date_from}&date_to={date_to}')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['total_assignments'], 1)
        self.assertEqual(response.data['date_from'], date_from)
        self.assertEqual(response.data['date_to'], date_to)

    def test_dispatcher_statistics_date_range_invalid(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/statistics/?date_from=2026-99-01')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_non_dispatcher_access_denied(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get('/api/dispatcher/dashboard/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_monitoring_returns_exceptions(self):
        self.order.created_at = timezone.now() - timedelta(hours=3)
        self.order.save(update_fields=['created_at'])

        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.get('/api/dispatcher/monitoring/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('exceptions', response.data)
        self.assertIn('exceptions_count', response.data)
        self.assertIn('exceptions_by_type', response.data)
        self.assertGreaterEqual(response.data['exceptions_count'], 1)

    def test_monitoring_acknowledge_exception_hides_it(self):
        self.order.created_at = timezone.now() - timedelta(hours=3)
        self.order.save(update_fields=['created_at'])
        self.client.force_authenticate(user=self.dispatcher)

        response_before = self.client.get('/api/dispatcher/monitoring/?exception_type=delayed_pending')
        self.assertEqual(response_before.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(response_before.data['exceptions_count'], 1)

        ack_response = self.client.post('/api/dispatcher/exceptions/ack/', {
            'order_id': self.order.id,
            'exception_type': 'delayed_pending',
            'note': 'checked',
        }, format='json')
        self.assertEqual(ack_response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            DispatcherExceptionAction.objects.filter(
                dispatcher=self.dispatcher,
                order=self.order,
                exception_type='delayed_pending',
            ).exists()
        )

        response_after = self.client.get('/api/dispatcher/monitoring/?exception_type=delayed_pending')
        self.assertEqual(response_after.status_code, status.HTTP_200_OK)
        self.assertEqual(response_after.data['exceptions_count'], 0)

    def test_monitoring_snooze_exception_hides_it(self):
        self.order.created_at = timezone.now() - timedelta(hours=3)
        self.order.save(update_fields=['created_at'])
        self.client.force_authenticate(user=self.dispatcher)

        snooze_response = self.client.post('/api/dispatcher/exceptions/snooze/', {
            'order_id': self.order.id,
            'exception_type': 'delayed_pending',
            'minutes': 30,
        }, format='json')
        self.assertEqual(snooze_response.status_code, status.HTTP_200_OK)

        response = self.client.get('/api/dispatcher/monitoring/?exception_type=delayed_pending')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['exceptions_count'], 0)

    def test_monitoring_returns_priority_recommendations(self):
        self.order.created_at = timezone.now() - timedelta(hours=4)
        self.order.save(update_fields=['created_at'])
        self.client.force_authenticate(user=self.dispatcher)

        response = self.client.get('/api/dispatcher/monitoring/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('priority_recommendations', response.data)
        self.assertIn('eta_risk_summary', response.data)
        self.assertIsInstance(response.data['priority_recommendations'], list)
        self.assertTrue(len(response.data['priority_recommendations']) >= 1)

        first_item = response.data['priority_recommendations'][0]
        self.assertIn('priority_score', first_item)
        self.assertIn('eta_risk', first_item)
        self.assertIn('suggested_driver', first_item)

    def test_monitoring_returns_incident_playbook_and_sla_risk(self):
        self.advertisement.delivery_deadline = timezone.now() + timedelta(minutes=30)
        self.advertisement.save(update_fields=['delivery_deadline'])
        self.order.created_at = timezone.now() - timedelta(minutes=190)
        self.order.save(update_fields=['created_at'])
        self.client.force_authenticate(user=self.dispatcher)

        response = self.client.get('/api/dispatcher/monitoring/?delay_threshold_minutes=60')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('incident_playbook', response.data)
        self.assertIn('sla_breach_risk_panel', response.data)
        self.assertIn('items', response.data['incident_playbook'])
        self.assertIn('summary', response.data['sla_breach_risk_panel'])
        self.assertGreaterEqual(response.data['incident_playbook']['auto_escalated_count'], 1)

    def test_suggestions_assign_endpoint(self):
        self.client.force_authenticate(user=self.dispatcher)
        response = self.client.post('/api/dispatcher/suggestions/assign/', {
            'order_id': self.order.id
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['order']['id'], self.order.id)
        self.assertIsNotNone(response.data['assigned_driver'])

    def test_drivers_locations_bbox_filter(self):
        self.order.current_location_lat = 41.3
        self.order.current_location_lng = 69.2
        self.order.save(update_fields=['current_location_lat', 'current_location_lng'])
        self.client.force_authenticate(user=self.dispatcher)

        inside = self.client.get('/api/dispatcher/drivers/locations/?min_lat=41.0&max_lat=42.0&min_lng=69.0&max_lng=70.0')
        self.assertEqual(inside.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(inside.data), 1)

        outside = self.client.get('/api/dispatcher/drivers/locations/?min_lat=40.0&max_lat=41.0&min_lng=68.0&max_lng=69.0')
        self.assertEqual(outside.status_code, status.HTTP_200_OK)
        self.assertEqual(len(outside.data), 0)

    def test_monitoring_includes_document_expiry_alerts(self):
        DriverDocument.objects.create(
            user=self.driver,
            document_type=DriverDocument.DOC_TYPE_DRIVER_LICENSE,
            document_number='DL-1001',
            expires_at=timezone.now().date() + timedelta(days=5),
            is_active=True,
        )
        self.client.force_authenticate(user=self.dispatcher)

        response = self.client.get('/api/dispatcher/monitoring/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('document_expiry_alerts', response.data)
        self.assertGreaterEqual(response.data['document_expiry_alerts']['count'], 1)
