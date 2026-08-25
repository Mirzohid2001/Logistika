from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.payments.completion_fees import completion_fee_summary
from apps.payments.models import OrderCompletionFee, OrderCompletionFeeSettings, Payment

User = get_user_model()


@override_settings(PAYMENTS_ALLOW_MOCK=True)
class OrderCompletionFeeFlowTest(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998907770001',
            password='pass',
            company_inn='123456789',
        )
        self.driver_user = User.objects.create_user(
            phone='998907770002',
            password='pass',
            is_driver=True,
            document_photos=['driver.jpg'],
        )
        country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='CF1',
        )
        self.city = City.objects.create(
            country=country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Fee test',
            title_en='Fee test',
            title_uz='Fee test',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('500000'),
        )
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=OrderStatus.objects.get(code='new'),
            agreed_amount=Decimal('500000'),
        )
        self.settings = OrderCompletionFeeSettings.objects.get(pk=1)
        self.settings.is_enabled = True
        self.settings.client_fee_enabled = True
        self.settings.driver_fee_enabled = True
        self.settings.client_fee_amount = Decimal('50')
        self.settings.driver_fee_amount = Decimal('30')
        self.settings.currency = 'UZS'
        self.settings.save()

    def complete_order(self):
        self.order.status = OrderStatus.objects.get(code='completed')
        self.order.completed_at = timezone.now()
        self.order.save(update_fields=['status', 'completed_at', 'updated_at'])

    def test_completion_creates_snapshotted_idempotent_fees_for_both_parties(self):
        self.complete_order()

        client_fee = OrderCompletionFee.objects.get(order=self.order, role='client')
        driver_fee = OrderCompletionFee.objects.get(order=self.order, role='driver')
        self.assertEqual(client_fee.user, self.client_user)
        self.assertEqual(client_fee.amount, Decimal('50'))
        self.assertEqual(driver_fee.user, self.driver_user)
        self.assertEqual(driver_fee.amount, Decimal('30'))
        self.assertEqual(client_fee.currency, 'UZS')

        self.settings.client_fee_amount = Decimal('99')
        self.settings.save()
        self.order.save(update_fields=['updated_at'])

        self.assertEqual(OrderCompletionFee.objects.filter(order=self.order).count(), 2)
        client_fee.refresh_from_db()
        self.assertEqual(client_fee.amount, Decimal('50'))

    def test_pending_fee_blocks_new_client_advertisement(self):
        self.complete_order()
        self.api.force_authenticate(user=self.client_user)

        response = self.api.post('/api/advertisements/', {}, format='json')

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'service_fee_required')
        self.assertTrue(response.data['service_fee']['required'])

    def test_pending_fee_blocks_driver_bid(self):
        self.complete_order()
        other_ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Other',
            title_en='Other',
            title_uz='Other',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            proposed_cost=Decimal('100000'),
        )
        self.api.force_authenticate(user=self.driver_user)

        response = self.api.post(
            '/api/bids/',
            {'advertisement': other_ad.id, 'proposed_amount': '90000'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'service_fee_required')

    def test_mock_payment_uses_server_amount_settles_fee_and_unblocks_user(self):
        self.complete_order()
        fee = OrderCompletionFee.objects.get(order=self.order, role='client')
        self.api.force_authenticate(user=self.client_user)

        response = self.api.post(
            f'/api/payments/completion-fees/{fee.id}/pay/',
            {'payment_method': 'mock', 'amount': '0.01'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        payment = Payment.objects.get(pk=response.data['id'])
        fee.refresh_from_db()
        self.assertEqual(payment.amount, Decimal('50'))
        self.assertEqual(payment.currency, 'UZS')
        self.assertEqual(payment.completion_fee, fee)
        self.assertEqual(payment.payment_status, 'completed')
        self.assertEqual(fee.status, OrderCompletionFee.STATUS_PAID)
        self.assertEqual(fee.paid_payment, payment)
        self.assertFalse(completion_fee_summary(self.client_user)['required'])
        self.assertEqual(self.order.paid_amount, Decimal('0'))

    def test_user_cannot_pay_another_users_fee(self):
        self.complete_order()
        driver_fee = OrderCompletionFee.objects.get(order=self.order, role='driver')
        self.api.force_authenticate(user=self.client_user)

        response = self.api.post(
            f'/api/payments/completion-fees/{driver_fee.id}/pay/',
            {'payment_method': 'mock'},
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(Payment.objects.filter(completion_fee=driver_fee).exists())

    def test_disabled_settings_create_no_fees(self):
        self.settings.is_enabled = False
        self.settings.save()

        self.complete_order()

        self.assertFalse(OrderCompletionFee.objects.filter(order=self.order).exists())
