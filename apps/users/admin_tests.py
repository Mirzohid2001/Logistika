from django.test import TestCase, Client
from django.contrib.auth import get_user_model
from django.urls import reverse
from apps.orders.models import Order, OrderStatus
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from apps.payments.models import Payment

User = get_user_model()


class OperatorPermissionsTest(TestCase):
    def setUp(self):
        self.client = Client()
        self.admin_user = User.objects.create_user(
            phone='998901234566',
            password='testpass123',
            first_name='Admin',
            last_name='User',
            is_admin=True,
            is_staff=True,
            is_superuser=True
        )
        self.operator_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Operator',
            last_name='User',
            is_operator=True,
            is_staff=True
        )
        self.regular_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Regular',
            last_name='User',
            is_driver=False,
            is_staff=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True,
            is_verified=False
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
            client=self.regular_user,
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
        self.completed_status = OrderStatus.objects.get(code='completed')
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.regular_user,
            status=self.completed_status
        )

    def test_operator_can_access_user_model(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_operator_can_access_order_model(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:orders_order_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_operator_cannot_access_advertisement_model(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:advertisements_advertisement_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_cannot_access_bid_model(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:bids_bid_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_cannot_access_payment_model(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:payments_payment_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_can_view_user(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_change', args=[self.driver_user.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_operator_can_change_user_verification(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_change', args=[self.driver_user.id])
        data = {
            'phone': self.driver_user.phone,
            'first_name': self.driver_user.first_name,
            'last_name': self.driver_user.last_name,
            'is_verified': 'on'
        }
        response = self.client.post(url, data)
        self.driver_user.refresh_from_db()
        self.assertTrue(self.driver_user.is_verified)

    def test_operator_cannot_change_user_permissions(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_change', args=[self.driver_user.id])
        initial_is_driver = self.driver_user.is_driver
        data = {
            'phone': self.driver_user.phone,
            'first_name': self.driver_user.first_name,
            'last_name': self.driver_user.last_name,
            'is_verified': 'on',
            'is_driver': 'on'
        }
        response = self.client.post(url, data)
        self.driver_user.refresh_from_db()
        self.assertEqual(self.driver_user.is_driver, initial_is_driver)

    def test_operator_cannot_add_user(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_add')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_cannot_delete_user(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:users_user_delete', args=[self.driver_user.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_can_view_order(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:orders_order_change', args=[self.order.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_operator_can_change_order(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:orders_order_change', args=[self.order.id])
        pending_status = OrderStatus.objects.get(code='pending')
        data = {
            'status': pending_status.id,
            'advertisement': self.order.advertisement.id,
            'driver': self.order.driver.id,
            'client': self.order.client.id
        }
        response = self.client.post(url, data, follow=True)
        self.assertEqual(response.status_code, 200)

    def test_operator_cannot_add_order(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:orders_order_add')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_operator_cannot_delete_order(self):
        self.client.force_login(self.operator_user)
        url = reverse('admin:orders_order_delete', args=[self.order.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 403)

    def test_admin_can_access_all_models(self):
        self.client.force_login(self.admin_user)
        url = reverse('admin:advertisements_advertisement_changelist')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_admin_can_add_user(self):
        self.client.force_login(self.admin_user)
        url = reverse('admin:users_user_add')
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

    def test_admin_can_delete_user(self):
        self.client.force_login(self.admin_user)
        url = reverse('admin:users_user_delete', args=[self.driver_user.id])
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)

