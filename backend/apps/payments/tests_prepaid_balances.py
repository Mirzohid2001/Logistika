from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.orders.marketplace_recovery import reopen_advertisement_marketplace
from apps.payments.balances import (
    fund_order_assignment,
    get_balance,
    release_order_funds,
    settle_prepaid_order,
)
from apps.payments.models import (
    AccountBalance,
    BalanceEntry,
    BalanceExchangeRateSettings,
    BalanceReservation,
    LedgerEntry,
    OrderCompletionFeeSettings,
    Payment,
)
from apps.payments.order_payment import mark_payment_completed


User = get_user_model()


@override_settings(PAYMENTS_ALLOW_MOCK=True, PREPAID_BALANCES_ENFORCED=True)
class PrepaidBalanceFlowTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901110001',
            password='pass12345',
            company_inn='123456789',
        )
        self.driver_user = User.objects.create_user(
            phone='998901110002',
            password='pass12345',
            is_driver=True,
        )
        country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O‘zbekiston',
            code='PB1',
        )
        self.city_from = City.objects.create(
            country=country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.city_to = City.objects.create(
            country=country,
            name_ru='Самарканд',
            name_en='Samarkand',
            name_uz='Samarqand',
        )
        self.pending, _created = OrderStatus.objects.get_or_create(
            code='pending',
            defaults={
                'name_ru': 'Ожидает',
                'name_en': 'Pending',
                'name_uz': 'Kutilmoqda',
            },
        )
        OrderCompletionFeeSettings.objects.update_or_create(
            pk=1,
            defaults={
                'is_enabled': True,
                'client_fee_enabled': True,
                'driver_fee_enabled': True,
                'client_fee_amount': Decimal('50'),
                'driver_fee_amount': Decimal('40'),
                'currency': 'USD',
            },
        )

    def _top_up(self, user, balance_type, amount, currency):
        self.api.force_authenticate(user=user)
        response = self.api.post(
            '/api/payments/balances/top-up/',
            {
                'balance_type': balance_type,
                'amount': amount,
                'currency': currency,
                'payment_method': 'mock',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['payment_status'], 'completed')
        return response

    def _advertisement_payload(self, *, amount='10000000', currency='UZS'):
        return {
            'title_ru': 'Предоплаченный груз',
            'title_en': 'Prepaid cargo',
            'title_uz': 'Oldindan to‘langan yuk',
            'description_ru': 'Тест новой схемы балансов',
            'description_en': 'Balance test',
            'description_uz': 'Balans sinovi',
            'proposed_cost': amount,
            'currency': currency,
            'weight': '1000',
            'departure_address': 'Склад A',
            'departure_city': self.city_from.id,
            'destination_address': 'Склад B',
            'destination_city': self.city_to.id,
        }

    def _create_funded_advertisement(self):
        self._top_up(self.client_user, 'order', '10000000', 'UZS')
        self._top_up(self.client_user, 'commission', '50', 'USD')
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(
            '/api/advertisements/',
            self._advertisement_payload(),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        return Advertisement.objects.get(pk=response.data['id'])

    def test_top_up_credits_only_selected_unified_balance(self):
        self._top_up(self.client_user, 'order', '10000000', 'UZS')

        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        commission_balance = get_balance(self.client_user, AccountBalance.TYPE_COMMISSION, 'UZS')
        self.assertEqual(order_balance.available, Decimal('10000000'))
        self.assertEqual(commission_balance.available, Decimal('0'))
        self.assertEqual(
            BalanceEntry.objects.filter(
                balance=order_balance,
                entry_type=BalanceEntry.TYPE_TOP_UP,
            ).count(),
            1,
        )

    def test_driver_balance_endpoint_exposes_only_commission_balances(self):
        self.api.force_authenticate(user=self.driver_user)

        response = self.api.get('/api/payments/balances/', {'role': 'driver'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data['balances']), 1)
        self.assertEqual({item['type'] for item in response.data['balances']}, {'commission'})
        self.assertEqual(response.data['balances'][0]['base_currency'], 'USD')
        self.assertEqual(set(response.data['balances'][0]['display']), {'UZS', 'USD'})
        self.assertEqual(response.data['commission']['amount_per_order'], 40.0)
        self.assertEqual(response.data['commission']['currency'], 'USD')

    def test_commission_top_up_accepts_uzs_and_converts_to_single_usd_balance(self):
        BalanceExchangeRateSettings.objects.update_or_create(
            pk=1,
            defaults={'usd_to_uzs': Decimal('13000')},
        )
        self.api.force_authenticate(user=self.driver_user)

        response = self.api.post(
            '/api/payments/balances/top-up/',
            {
                'balance_type': 'commission',
                'amount': '650000',
                'currency': 'UZS',
                'payment_method': 'mock',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(response.data['payment_status'], 'completed')
        balance = get_balance(self.driver_user, AccountBalance.TYPE_COMMISSION)
        self.assertEqual(balance.currency, 'USD')
        self.assertEqual(balance.available, Decimal('50'))

    @patch('apps.payments.views.initiate_gateway_payment')
    def test_real_usd_top_up_charges_uzs_and_credits_usd(self, mock_gateway):
        BalanceExchangeRateSettings.objects.update_or_create(
            pk=1,
            defaults={'usd_to_uzs': Decimal('12500')},
        )
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(
            '/api/payments/balances/top-up/',
            {
                'balance_type': 'commission',
                'amount': '50',
                'currency': 'USD',
                'payment_method': 'click',
            },
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        self.assertEqual(Decimal(str(response.data['amount'])), Decimal('625000'))
        self.assertEqual(response.data['currency'], 'UZS')
        self.assertEqual(response.data['gateway_response']['balance_amount'], '50.00')
        self.assertEqual(response.data['gateway_response']['balance_currency'], 'USD')
        mock_gateway.assert_called_once()

        payment = Payment.objects.get(pk=response.data['id'])
        mark_payment_completed(payment)
        usd_balance = get_balance(self.client_user, AccountBalance.TYPE_COMMISSION, 'USD')
        self.assertEqual(usd_balance.available, Decimal('50'))

    def test_client_endpoint_exposes_two_balances_with_currency_views(self):
        self._top_up(self.client_user, 'order', '13000000', 'UZS')
        self._top_up(self.client_user, 'commission', '100', 'USD')
        self.api.force_authenticate(user=self.client_user)

        response = self.api.get('/api/payments/balances/', {'role': 'client'})

        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(len(response.data['balances']), 2)
        by_type = {item['type']: item for item in response.data['balances']}
        self.assertEqual(by_type['order']['display']['UZS']['available'], 13000000.0)
        self.assertEqual(by_type['order']['display']['USD']['available'], 1000.0)
        self.assertEqual(by_type['commission']['display']['USD']['available'], 100.0)
        self.assertEqual(by_type['commission']['display']['UZS']['available'], 1300000.0)

    def test_advertisement_is_not_created_without_both_balances(self):
        self._top_up(self.client_user, 'order', '10000000', 'UZS')
        self.api.force_authenticate(user=self.client_user)

        response = self.api.post(
            '/api/advertisements/',
            self._advertisement_payload(),
            format='json',
        )

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(response.data['code'], 'insufficient_balance')
        self.assertEqual(response.data['balance']['type'], 'commission')
        self.assertFalse(Advertisement.objects.exists())
        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        self.assertEqual(order_balance.available, Decimal('10000000'))
        self.assertEqual(order_balance.reserved, Decimal('0'))

    def test_create_reserves_order_and_client_commission(self):
        advertisement = self._create_funded_advertisement()

        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        commission_balance = get_balance(self.client_user, AccountBalance.TYPE_COMMISSION, 'USD')
        self.assertEqual(order_balance.available, Decimal('0'))
        self.assertEqual(order_balance.reserved, Decimal('10000000'))
        self.assertEqual(commission_balance.available, Decimal('0'))
        self.assertEqual(commission_balance.reserved, Decimal('50'))
        self.assertEqual(
            BalanceReservation.objects.filter(advertisement=advertisement, status='held').count(),
            2,
        )

    def test_assignment_adjusts_price_and_charges_both_commissions(self):
        advertisement = self._create_funded_advertisement()
        self._top_up(self.driver_user, 'commission', '40', 'USD')
        order = Order.objects.create(
            advertisement=advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.pending,
            agreed_amount=Decimal('9000000'),
        )

        fund_order_assignment(advertisement, self.driver_user, Decimal('9000000'), order)

        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        client_commission = get_balance(self.client_user, AccountBalance.TYPE_COMMISSION, 'USD')
        driver_commission = get_balance(self.driver_user, AccountBalance.TYPE_COMMISSION, 'USD')
        self.assertEqual(order_balance.available, Decimal('1000000'))
        self.assertEqual(order_balance.reserved, Decimal('9000000'))
        self.assertEqual(client_commission.available, Decimal('0'))
        self.assertEqual(client_commission.reserved, Decimal('0'))
        self.assertEqual(driver_commission.available, Decimal('0'))
        self.assertEqual(driver_commission.reserved, Decimal('0'))
        self.assertTrue(order.is_payment_settled)
        self.assertEqual(
            BalanceReservation.objects.get(
                advertisement=advertisement,
                purpose=BalanceReservation.PURPOSE_CLIENT_COMMISSION,
            ).status,
            BalanceReservation.STATUS_CAPTURED,
        )

    def test_completed_order_moves_transport_funds_to_driver_earnings(self):
        advertisement = self._create_funded_advertisement()
        self._top_up(self.driver_user, 'commission', '40', 'USD')
        order = Order.objects.create(
            advertisement=advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.pending,
            agreed_amount=Decimal('10000000'),
        )
        fund_order_assignment(advertisement, self.driver_user, order.agreed_amount, order)

        settle_prepaid_order(order)
        settle_prepaid_order(order)

        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        self.driver_user.wallet.refresh_from_db()
        self.assertEqual(order_balance.reserved, Decimal('0'))
        self.assertEqual(self.driver_user.wallet.available, Decimal('10000000'))
        self.assertEqual(
            LedgerEntry.objects.filter(idempotency_key=f'prepaid_complete:{order.id}').count(),
            1,
        )

    def test_usd_order_uses_locked_rate_for_driver_wallet(self):
        BalanceExchangeRateSettings.objects.update_or_create(
            pk=1,
            defaults={'usd_to_uzs': Decimal('12000')},
        )
        self._top_up(self.client_user, 'order', '100', 'USD')
        self._top_up(self.client_user, 'commission', '50', 'USD')
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(
            '/api/advertisements/',
            self._advertisement_payload(amount='100', currency='USD'),
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED, response.data)
        advertisement = Advertisement.objects.get(pk=response.data['id'])
        self._top_up(self.driver_user, 'commission', '40', 'USD')
        order = Order.objects.create(
            advertisement=advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.pending,
            agreed_amount=Decimal('100'),
        )
        fund_order_assignment(advertisement, self.driver_user, order.agreed_amount, order)

        # A later admin rate change must not alter an already funded contract.
        BalanceExchangeRateSettings.objects.update_or_create(
            pk=1,
            defaults={'usd_to_uzs': Decimal('14000')},
        )
        settle_prepaid_order(order)

        self.driver_user.wallet.refresh_from_db()
        self.assertEqual(self.driver_user.wallet.available, Decimal('1200000'))

    def test_cancellation_returns_order_hold_but_not_commissions(self):
        advertisement = self._create_funded_advertisement()
        self._top_up(self.driver_user, 'commission', '40', 'USD')
        order = Order.objects.create(
            advertisement=advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.pending,
            agreed_amount=Decimal('10000000'),
        )
        fund_order_assignment(advertisement, self.driver_user, order.agreed_amount, order)

        refunded = release_order_funds(order)

        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        client_commission = get_balance(self.client_user, AccountBalance.TYPE_COMMISSION, 'USD')
        driver_commission = get_balance(self.driver_user, AccountBalance.TYPE_COMMISSION, 'USD')
        self.assertEqual(refunded, Decimal('10000000'))
        self.assertEqual(order_balance.available, Decimal('10000000'))
        self.assertEqual(order_balance.reserved, Decimal('0'))
        self.assertEqual(client_commission.available, Decimal('0'))
        self.assertEqual(driver_commission.available, Decimal('0'))

    def test_cancelled_ad_is_not_reopened_without_next_client_commission(self):
        advertisement = self._create_funded_advertisement()
        self._top_up(self.driver_user, 'commission', '40', 'USD')
        order = Order.objects.create(
            advertisement=advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=self.pending,
            agreed_amount=Decimal('10000000'),
        )
        fund_order_assignment(advertisement, self.driver_user, order.agreed_amount, order)
        release_order_funds(order)
        advertisement.is_closed = True
        advertisement.save(update_fields=['is_closed', 'updated_at'])

        reopened = reopen_advertisement_marketplace(advertisement)

        advertisement.refresh_from_db()
        order_balance = get_balance(self.client_user, AccountBalance.TYPE_ORDER, 'UZS')
        self.assertFalse(reopened)
        self.assertTrue(advertisement.is_closed)
        self.assertEqual(order_balance.available, Decimal('10000000'))
        self.assertEqual(order_balance.reserved, Decimal('0'))
