from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.contrib.auth import get_user_model
from django.utils import timezone
from datetime import timedelta
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import Order, OrderStatus, OrderLocationTrack, OrderProofOfDelivery
from .tasks import update_active_order_locations
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City

User = get_user_model()

POD_PNG = (
    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08'
    b'\x00\x00\x00\x08\x08\x02\x00\x00\x00Km)\xdc\x00\x00'
    b'\x00\x14IDATx\x9cc\x14\tX\xc0\x80\r0a\x15\x1d\xb4\x12'
    b'\x00\xcf\x94\x01\x14\xcb\xbd\xc6M\x00\x00\x00\x00IEND\xaeB`\x82'
)


def _pod_photo():
    return SimpleUploadedFile('pod.png', POD_PNG, content_type='image/png')


class OrderModelTest(TestCase):
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
        self.dispatcher_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True,
            is_client=False,
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
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz='Test e\'lon',
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            weight=100.0,
            departure_address='Test departure',
            departure_city=self.city,
            destination_address='Test destination',
            destination_city=self.city,
            proposed_cost=500000
        )
        self.status = OrderStatus.objects.get(code='new')

    def test_order_creation(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.status
        )
        self.assertEqual(order.advertisement, self.advertisement)
        self.assertEqual(order.status.code, 'new')
        self.assertEqual(order.status.name_ru, 'Новый')


class OrderAPITest(TestCase):
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
        self.dispatcher_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Dispatcher',
            last_name='User',
            is_dispatcher=True
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
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz='Test e\'lon',
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            weight=100.0,
            departure_address='Test departure',
            departure_city=self.city,
            destination_address='Test destination',
            destination_city=self.city,
            proposed_cost=500000
        )
        self.new_status = OrderStatus.objects.get(code='new')
        self.in_progress_status = OrderStatus.objects.get(code='in_progress')

    def test_get_orders_list(self):
        Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status
        )
        self.client.force_authenticate(user=self.client_user)
        url = '/api/orders/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data['results']), 1)

    def test_start_order(self):
        approved_status = OrderStatus.objects.filter(code='approved_by_client').first()
        if not approved_status:
            approved_status = OrderStatus.objects.create(
                code='approved_by_client',
                name_ru='Одобрен клиентом',
                name_en='Approved by Client',
                name_uz='Mijoz tomonidan tasdiqlangan',
            )
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=approved_status,
        )
        self.advertisement.departure_address = 'Pickup 41.311100, 69.279700'
        self.advertisement.destination_address = 'Delivery 41.350000, 69.320000'
        self.advertisement.save(update_fields=['departure_address', 'destination_address'])
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/orders/{order.id}/start/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status.code, 'in_progress')

    def test_start_order_requires_coordinates(self):
        self.city.latitude = None
        self.city.longitude = None
        self.city.save(update_fields=['latitude', 'longitude'])
        approved_status = OrderStatus.objects.filter(code='approved_by_client').first()
        if not approved_status:
            approved_status = OrderStatus.objects.create(
                code='approved_by_client',
                name_ru='Одобрен клиентом',
                name_en='Approved by Client',
                name_uz='Mijoz tomonidan tasdiqlangan',
            )
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=approved_status,
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/orders/{order.id}/start/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('koordinata', response.data.get('error', '').lower())

    def test_start_order_rejects_pending(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/orders/{order.id}/start/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_depart_order(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/orders/{order.id}/depart/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status.code, 'in_transit')

    def test_dispatcher_can_get_order_detail(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.get(f'/api/orders/{order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_order_detail_includes_nested_advertisement(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.new_status,
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.get(f'/api/orders/{order.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data['advertisement'], dict)
        self.assertEqual(response.data['advertisement']['id'], self.advertisement.id)
        self.assertEqual(response.data['advertisement']['departure_address'], 'Test departure')
        self.assertIn('departure_city', response.data['advertisement'])

    def test_dispatcher_cannot_approve_as_client(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        response = self.client.post(f'/api/orders/{order.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_order_owner_can_approve_even_with_driver_flag(self):
        hybrid_client = User.objects.create_user(
            phone='998901234599',
            password='testpass123',
            first_name='Hybrid',
            last_name='Client',
            is_driver=True,
            is_client=True,
        )
        ad = Advertisement.objects.create(
            client=hybrid_client,
            title_ru='Тест',
            title_en='Test',
            title_uz='Test',
            description_ru='',
            description_en='',
            description_uz='',
            weight=10,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
            proposed_cost=1000,
        )
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver_user,
            client=hybrid_client,
            status=pending_status,
        )
        self.client.force_authenticate(user=hybrid_client)
        response = self.client.post(f'/api/orders/{order.id}/approve/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertEqual(order.status.code, 'approved_by_client')

    def test_client_can_decline_pending_order(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Decline test',
            title_en='Decline test',
            title_uz='Decline test',
            description_ru='',
            description_en='',
            description_uz='',
            weight=10,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
            proposed_cost=1000,
            is_closed=True,
        )
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(f'/api/orders/{order.id}/decline/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        ad.refresh_from_db()
        self.assertEqual(order.status.code, 'cancelled')
        self.assertFalse(ad.is_closed)

    def test_client_can_decline_approved_order(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Decline approved',
            title_en='Decline approved',
            title_uz='Decline approved',
            description_ru='',
            description_en='',
            description_uz='',
            weight=10,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
            proposed_cost=1000,
            is_closed=True,
        )
        approved_status = OrderStatus.objects.get(code='approved_by_client')
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver_user,
            client=self.client_user,
            status=approved_status,
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(f'/api/orders/{order.id}/decline/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        ad.refresh_from_db()
        self.assertEqual(order.status.code, 'cancelled')
        self.assertFalse(ad.is_closed)

    def test_return_quality_classification(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status
        )
        self.client.force_authenticate(user=self.dispatcher_user)
        url = f'/api/orders/{order.id}/return-quality/'
        response = self.client.post(url, {
            'quality_status': 'damaged',
            'note': 'Package opened and damaged',
        }, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['return_quality']['quality_status'], 'damaged')

    def test_tracking_share_link_public(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
            planned_route_points=[
                {'lat': 41.3111, 'lng': 69.2797},
                {'lat': 41.3200, 'lng': 69.2900},
            ],
            current_location_lat=41.3111,
            current_location_lng=69.2797,
        )
        self.client.force_authenticate(user=self.client_user)
        create_response = self.client.post(
            f'/api/orders/{order.id}/share-link/',
            {'expires_in_hours': 2},
            format='json'
        )
        self.assertEqual(create_response.status_code, status.HTTP_200_OK)
        token = create_response.data['token']

        self.client.force_authenticate(user=None)
        public_response = self.client.get(f'/api/orders/share/{token}/')
        self.assertEqual(public_response.status_code, status.HTTP_200_OK)
        self.assertEqual(public_response.data['order_id'], order.id)
        self.assertIn('eta_minutes', public_response.data)


class OrderLocationTrackingTest(TestCase):
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
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz='Test e\'lon',
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            weight=100.0,
            departure_address='Test departure',
            departure_city=self.city,
            destination_address='Test destination',
            destination_city=self.city,
            proposed_cost=500000
        )
        self.in_progress_status = OrderStatus.objects.get(code='in_progress')

    def test_update_location_creates_track(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/update-location/'
        data = {'lat': '41.3111', 'lng': '69.2797'}
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_periodic_task_updates_locations(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_periodic_task_skips_recent_updates(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        OrderLocationTrack.objects.create(
            order=order,
            lat=41.3111,
            lng=69.2797,
            timestamp=timezone.now() - timedelta(minutes=5)
        )
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count)

    def test_periodic_task_updates_after_10_minutes(self):
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_progress_status,
            current_location_lat=41.3111,
            current_location_lng=69.2797,
            started_at=timezone.now()
        )
        
        old_track = OrderLocationTrack.objects.create(
            order=order,
            lat=41.3111,
            lng=69.2797
        )
        old_track.timestamp = timezone.now() - timedelta(minutes=11)
        old_track.save()
        
        initial_count = OrderLocationTrack.objects.filter(order=order).count()
        
        update_active_order_locations()
        
        final_count = OrderLocationTrack.objects.filter(order=order).count()
        self.assertEqual(final_count, initial_count + 1)

    def test_geofence_pickup_enter_does_not_auto_start(self):
        approved_status = OrderStatus.objects.filter(code='approved_by_client').first()
        if not approved_status:
            approved_status = OrderStatus.objects.create(
                code='approved_by_client',
                name_ru='Подтверждён клиентом',
                name_uz='Mijoz tasdiqladi',
            )
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=approved_status,
            planned_route_points=[
                {'lat': 41.311100, 'lng': 69.279700},
                {'lat': 41.320000, 'lng': 69.290000},
            ],
            pickup_geofence_radius_meters=300,
        )

        self.client.force_authenticate(user=self.driver_user)
        url = f'/api/orders/{order.id}/update-location/'
        response = self.client.post(url, {'lat': '41.311100', 'lng': '69.279700'}, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        order.refresh_from_db()
        self.assertTrue(order.is_in_pickup_geofence)
        self.assertIsNotNone(order.pickup_entered_at)
        self.assertEqual(order.status.code, 'approved_by_client')


class AdvertisementDirectAcceptTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901235567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False,
        )
        self.driver_user = User.objects.create_user(
            phone='998901235568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True,
            is_verified=True,
            document_photos=['passport.jpg'],
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
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Тестовое объявление',
            title_en='Test Advertisement',
            title_uz="Test e'lon",
            description_ru='Тестовое описание',
            description_en='Test description',
            description_uz='Test tavsif',
            weight=100.0,
            departure_address='Test departure',
            departure_city=self.city,
            destination_address='Test destination',
            destination_city=self.city,
            proposed_cost=500000,
        )
        from apps.vehicles.models import Vehicle

        Vehicle.objects.create(
            user=self.driver_user,
            make='MAN',
            model='TGX',
            number='01A777AA',
            cargo_volume=50,
            load_capacity=20,
            is_verified=True,
        )

    def test_direct_accept_creates_pending_order_and_notifies_client(self):
        from apps.notifications.models import Notification

        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/advertisements/{self.advertisement.id}/accept/')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        order = Order.objects.get(advertisement=self.advertisement, driver=self.driver_user)
        self.assertEqual(order.status.code, 'pending')
        self.assertTrue(
            Notification.objects.filter(
                user=self.client_user,
                order=order,
                notification_type='order_created',
            ).exists()
        )
        self.advertisement.refresh_from_db()
        self.assertTrue(self.advertisement.is_closed)


class OfflinePaymentOrderTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234570',
            password='testpass123',
            first_name='Client',
            last_name='Offline',
            is_driver=False,
        )
        self.driver_user = User.objects.create_user(
            phone='998901234571',
            password='testpass123',
            first_name='Driver',
            last_name='Offline',
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
            name_en='Tashkent',
            defaults={
                'name_ru': 'Ташкент',
                'name_uz': 'Toshkent',
            },
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Offline payment',
            title_en='Offline payment',
            title_uz='Offline payment',
            description_ru='',
            description_en='',
            description_uz='',
            weight=100.0,
            departure_address='A',
            departure_city=self.city,
            destination_address='B',
            destination_city=self.city,
            proposed_cost=6_000_000,
        )
        self.in_transit_status = OrderStatus.objects.get(code='in_transit')

    def _create_in_transit_order(self):
        return Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.in_transit_status,
        )

    def test_driver_can_mark_payment_received_and_unpaid(self):
        order = self._create_in_transit_order()
        self.client.force_authenticate(user=self.driver_user)

        response = self.client.post(
            f'/api/orders/{order.id}/mark-driver-payment/',
            {'received': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['client_payment_confirmed'])
        order.refresh_from_db()
        self.assertTrue(order.client_payment_confirmed)
        self.assertIsNotNone(order.client_payment_confirmed_at)

        response = self.client.post(
            f'/api/orders/{order.id}/mark-driver-payment/',
            {'received': False},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.data['client_payment_confirmed'])

    def test_mark_driver_payment_rejects_pending_order(self):
        pending_status = OrderStatus.objects.get(code='pending')
        order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=pending_status,
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(
            f'/api/orders/{order.id}/mark-driver-payment/',
            {'received': True},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_driver_cannot_complete_without_payment_settlement(self):
        order = self._create_in_transit_order()
        OrderProofOfDelivery.objects.create(
            order=order,
            delivered_by=self.driver_user,
            receiver_name='Receiver',
            delivered_lat=41.311100,
            delivered_lng=69.279700,
            delivery_photo=_pod_photo(),
        )
        self.assertFalse(order.is_payment_settled)

        self.client.force_authenticate(user=self.driver_user)
        response = self.client.post(f'/api/orders/{order.id}/complete/')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data.get('code'), 'payment_required')
