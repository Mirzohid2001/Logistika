from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
import uuid

from django.db import transaction
from django.utils import timezone
from django.conf import settings as django_settings

from apps.users.roles import is_staff_account

from .models import (
    AccountBalance,
    BalanceExchangeRateSettings,
    BalanceEntry,
    BalanceReservation,
    OrderCompletionFeeSettings,
    Payment,
)


ZERO = Decimal('0.00')
CENT = Decimal('0.01')
SUPPORTED_CURRENCIES = frozenset({'UZS', 'USD'})
BALANCE_BASE_CURRENCIES = {
    AccountBalance.TYPE_ORDER: 'UZS',
    AccountBalance.TYPE_COMMISSION: 'USD',
}


def prepaid_balances_enabled() -> bool:
    return bool(getattr(django_settings, 'PREPAID_BALANCES_ENFORCED', True))


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def normalize_currency(value: str | None) -> str:
    currency = str(value or 'UZS').strip().upper()
    if currency not in SUPPORTED_CURRENCIES:
        raise ValueError('Faqat UZS yoki USD valyutasi qo\'llab-quvvatlanadi')
    return currency


def balance_base_currency(balance_type: str) -> str:
    try:
        return BALANCE_BASE_CURRENCIES[balance_type]
    except KeyError as exc:
        raise ValueError('Noto\'g\'ri balans turi') from exc


def convert_currency(
    amount,
    from_currency: str,
    to_currency: str,
    *,
    usd_to_uzs=None,
) -> Decimal:
    """Convert a money amount using the single admin-managed exchange rate."""
    amount = money(amount)
    from_currency = normalize_currency(from_currency)
    to_currency = normalize_currency(to_currency)
    if from_currency == to_currency:
        return amount
    rate = money(usd_to_uzs or get_exchange_rate_settings().usd_to_uzs)
    if rate <= ZERO:
        raise ValueError('USD kursi 0 dan katta bo\'lishi kerak')
    if from_currency == 'USD':
        return money(amount * rate)
    return money(amount / rate)


class InsufficientBalanceError(ValueError):
    def __init__(
        self,
        *,
        balance_type: str,
        currency: str,
        required: Decimal,
        available: Decimal,
        owner: str = 'user',
    ):
        self.balance_type = balance_type
        self.currency = currency
        self.required = money(required)
        self.available = money(available)
        self.shortfall = money(max(ZERO, self.required - self.available))
        self.owner = owner
        super().__init__('Insufficient balance')

    def payload(self) -> dict:
        label = 'buyurtma' if self.balance_type == AccountBalance.TYPE_ORDER else 'komissiya'
        return {
            'error': (
                f'{label.capitalize()} balansida mablag\' yetarli emas. '
                f'Kerak: {self.required} {self.currency}, mavjud: {self.available} {self.currency}.'
            ),
            'code': 'counterparty_insufficient_balance' if self.owner == 'counterparty' else 'insufficient_balance',
            'balance': {
                'type': self.balance_type,
                'currency': self.currency,
                'required': float(self.required),
                'available': float(self.available),
                'shortfall': float(self.shortfall),
                'owner': self.owner,
            },
        }


def get_commission_settings() -> OrderCompletionFeeSettings:
    settings, _created = OrderCompletionFeeSettings.objects.get_or_create(pk=1)
    return settings


def get_exchange_rate_settings() -> BalanceExchangeRateSettings:
    settings, _created = BalanceExchangeRateSettings.objects.get_or_create(pk=1)
    return settings


def balance_top_up_charge(amount, currency: str, balance_type: str) -> dict:
    """Return the UZS gateway charge and canonical amount to credit."""
    requested_amount = money(amount)
    requested_currency = normalize_currency(currency)
    balance_currency = balance_base_currency(balance_type)
    exchange_rate = money(get_exchange_rate_settings().usd_to_uzs)
    balance_amount = convert_currency(
        requested_amount,
        requested_currency,
        balance_currency,
        usd_to_uzs=exchange_rate,
    )
    charge_amount = convert_currency(
        requested_amount,
        requested_currency,
        'UZS',
        usd_to_uzs=exchange_rate,
    )
    return {
        'requested_amount': requested_amount,
        'requested_currency': requested_currency,
        'balance_amount': balance_amount,
        'balance_currency': balance_currency,
        'charge_amount': charge_amount,
        'charge_currency': 'UZS',
        'exchange_rate': exchange_rate,
    }


def get_balance(
    user,
    balance_type: str,
    currency: str | None = None,
    *,
    for_update: bool = False,
) -> AccountBalance:
    # ``currency`` remains accepted for callers during the migration, but it is
    # only a display/input currency now and never identifies another wallet.
    if currency is not None:
        normalize_currency(currency)
    base_currency = balance_base_currency(balance_type)
    queryset = AccountBalance.objects
    if for_update:
        queryset = queryset.select_for_update()
    balance, _created = queryset.get_or_create(
        user=user,
        balance_type=balance_type,
        defaults={'currency': base_currency, 'available': ZERO, 'reserved': ZERO},
    )
    if balance.currency != base_currency:
        raise ValueError('Balans bazaviy valyutasi noto\'g\'ri sozlangan')
    return balance


def _write_entry(
    *,
    balance: AccountBalance,
    entry_type: str,
    amount: Decimal,
    available_delta: Decimal = ZERO,
    reserved_delta: Decimal = ZERO,
    idempotency_key: str,
    reservation: BalanceReservation | None = None,
    advertisement=None,
    order=None,
    payment: Payment | None = None,
    note: str = '',
    metadata: dict | None = None,
) -> BalanceEntry:
    existing = BalanceEntry.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    amount = money(amount)
    available_delta = money(available_delta)
    reserved_delta = money(reserved_delta)
    balance.available = money(balance.available + available_delta)
    balance.reserved = money(balance.reserved + reserved_delta)
    if balance.available < ZERO or balance.reserved < ZERO:
        raise ValueError('Balance cannot become negative')
    balance.save(update_fields=['available', 'reserved', 'updated_at'])
    return BalanceEntry.objects.create(
        balance=balance,
        user=balance.user,
        reservation=reservation,
        advertisement=advertisement,
        order=order,
        payment=payment,
        entry_type=entry_type,
        amount=amount,
        available_delta=available_delta,
        reserved_delta=reserved_delta,
        idempotency_key=idempotency_key,
        note=note,
        metadata=metadata or {},
    )


@transaction.atomic
def credit_balance_from_payment(payment: Payment) -> AccountBalance | None:
    gateway = payment.gateway_response if isinstance(payment.gateway_response, dict) else {}
    if payment.payment_status != 'completed' or gateway.get('purpose') != 'balance_top_up':
        return None

    balance_type = gateway.get('balance_type')
    if balance_type not in (AccountBalance.TYPE_ORDER, AccountBalance.TYPE_COMMISSION):
        return None
    balance_currency = gateway.get('balance_currency') or balance_base_currency(balance_type)
    balance_amount = money(gateway.get('balance_amount', payment.amount))
    balance = get_balance(payment.user, balance_type, for_update=True)
    _write_entry(
        balance=balance,
        entry_type=BalanceEntry.TYPE_TOP_UP,
        amount=balance_amount,
        available_delta=balance_amount,
        idempotency_key=f'balance_top_up:{payment.id}',
        payment=payment,
        note=f'Balance top-up from payment #{payment.id}',
    )
    balance.refresh_from_db()
    return balance


def _reserve(
    *,
    user,
    balance_type: str,
    currency: str,
    amount: Decimal,
    advertisement,
    purpose: str,
    owner: str = 'user',
) -> BalanceReservation | None:
    requested_amount = money(amount)
    if requested_amount <= ZERO:
        return None
    requested_currency = normalize_currency(currency)
    exchange_rate = money(get_exchange_rate_settings().usd_to_uzs)
    balance = get_balance(user, balance_type, for_update=True)
    balance_amount = convert_currency(
        requested_amount,
        requested_currency,
        balance.currency,
        usd_to_uzs=exchange_rate,
    )
    existing = BalanceReservation.objects.select_for_update().filter(
        advertisement=advertisement,
        purpose=purpose,
        status=BalanceReservation.STATUS_HELD,
    ).first()

    if existing:
        if existing.balance_id != balance.id:
            _release_reservation(existing, reason='balance_changed')
            existing = None
        else:
            delta = money(balance_amount - existing.balance_amount)
            if delta > ZERO:
                if balance.available < delta:
                    raise InsufficientBalanceError(
                        balance_type=balance_type,
                        currency=requested_currency,
                        required=requested_amount,
                        available=convert_currency(
                            balance.available,
                            balance.currency,
                            requested_currency,
                            usd_to_uzs=exchange_rate,
                        ),
                        owner=owner,
                    )
                _write_entry(
                    balance=balance,
                    entry_type=BalanceEntry.TYPE_RESERVE,
                    amount=delta,
                    available_delta=-delta,
                    reserved_delta=delta,
                    idempotency_key=f'balance_reserve_adjust_up:{existing.id}:{uuid.uuid4().hex}',
                    reservation=existing,
                    advertisement=advertisement,
                    note=f'Increase reservation to {requested_amount} {requested_currency}',
                    metadata={
                        'requested_amount': str(requested_amount),
                        'requested_currency': requested_currency,
                        'usd_to_uzs_rate': str(exchange_rate),
                    },
                )
            elif delta < ZERO:
                release_amount = abs(delta)
                _write_entry(
                    balance=balance,
                    entry_type=BalanceEntry.TYPE_RELEASE,
                    amount=release_amount,
                    available_delta=release_amount,
                    reserved_delta=-release_amount,
                    idempotency_key=f'balance_reserve_adjust_down:{existing.id}:{uuid.uuid4().hex}',
                    reservation=existing,
                    advertisement=advertisement,
                    note=f'Decrease reservation to {requested_amount} {requested_currency}',
                    metadata={
                        'requested_amount': str(requested_amount),
                        'requested_currency': requested_currency,
                        'usd_to_uzs_rate': str(exchange_rate),
                    },
                )
            if (
                delta
                or existing.amount != requested_amount
                or existing.currency != requested_currency
            ):
                existing.amount = requested_amount
                existing.currency = requested_currency
                existing.balance_amount = balance_amount
                if purpose == BalanceReservation.PURPOSE_CLIENT_ORDER:
                    existing.settlement_uzs_rate = (
                        Decimal('1.00') if requested_currency == 'UZS' else exchange_rate
                    )
                existing.save(update_fields=[
                    'amount',
                    'currency',
                    'balance_amount',
                    'settlement_uzs_rate',
                    'updated_at',
                ])
            return existing

    if balance.available < balance_amount:
        raise InsufficientBalanceError(
            balance_type=balance_type,
            currency=requested_currency,
            required=requested_amount,
            available=convert_currency(
                balance.available,
                balance.currency,
                requested_currency,
                usd_to_uzs=exchange_rate,
            ),
            owner=owner,
        )
    settlement_uzs_rate = None
    if purpose == BalanceReservation.PURPOSE_CLIENT_ORDER:
        settlement_uzs_rate = (
            Decimal('1.00')
            if requested_currency == 'UZS'
            else exchange_rate
        )
    reservation = BalanceReservation.objects.create(
        balance=balance,
        user=user,
        advertisement=advertisement,
        purpose=purpose,
        amount=requested_amount,
        currency=requested_currency,
        balance_amount=balance_amount,
        settlement_uzs_rate=settlement_uzs_rate,
    )
    _write_entry(
        balance=balance,
        entry_type=BalanceEntry.TYPE_RESERVE,
        amount=balance_amount,
        available_delta=-balance_amount,
        reserved_delta=balance_amount,
        idempotency_key=f'balance_reserve:{reservation.id}',
        reservation=reservation,
        advertisement=advertisement,
        note=f'Reserved for advertisement #{advertisement.id}',
        metadata={
            'requested_amount': str(requested_amount),
            'requested_currency': requested_currency,
            'usd_to_uzs_rate': str(exchange_rate),
        },
    )
    return reservation


def _release_reservation(reservation: BalanceReservation, *, reason: str) -> BalanceReservation:
    if reservation.status != BalanceReservation.STATUS_HELD:
        return reservation
    balance = AccountBalance.objects.select_for_update().get(pk=reservation.balance_id)
    _write_entry(
        balance=balance,
        entry_type=BalanceEntry.TYPE_RELEASE,
        amount=reservation.balance_amount,
        available_delta=reservation.balance_amount,
        reserved_delta=-reservation.balance_amount,
        idempotency_key=f'balance_release:{reservation.id}',
        reservation=reservation,
        advertisement=reservation.advertisement,
        order=reservation.order,
        note=reason,
    )
    reservation.status = BalanceReservation.STATUS_RELEASED
    reservation.released_at = timezone.now()
    reservation.save(update_fields=['status', 'released_at', 'updated_at'])
    return reservation


def _capture_reservation(reservation: BalanceReservation, *, order, reason: str) -> BalanceReservation:
    if reservation.status != BalanceReservation.STATUS_HELD:
        return reservation
    balance = AccountBalance.objects.select_for_update().get(pk=reservation.balance_id)
    _write_entry(
        balance=balance,
        entry_type=BalanceEntry.TYPE_CAPTURE,
        amount=reservation.balance_amount,
        reserved_delta=-reservation.balance_amount,
        idempotency_key=f'balance_capture:{reservation.id}',
        reservation=reservation,
        advertisement=reservation.advertisement,
        order=order,
        note=reason,
    )
    reservation.order = order
    reservation.status = BalanceReservation.STATUS_CAPTURED
    reservation.captured_at = timezone.now()
    reservation.save(update_fields=['order', 'status', 'captured_at', 'updated_at'])
    return reservation


@transaction.atomic
def reserve_advertisement_balances(advertisement) -> list[BalanceReservation]:
    if not prepaid_balances_enabled():
        return []
    if is_staff_account(advertisement.client):
        return []
    amount = money(advertisement.proposed_cost)
    if amount <= ZERO:
        raise ValueError('Buyurtma narxi 0 dan katta bo\'lishi kerak')
    currency = normalize_currency(advertisement.currency)
    reservations = [
        _reserve(
            user=advertisement.client,
            balance_type=AccountBalance.TYPE_ORDER,
            currency=currency,
            amount=amount,
            advertisement=advertisement,
            purpose=BalanceReservation.PURPOSE_CLIENT_ORDER,
        )
    ]
    fee_settings = get_commission_settings()
    existing_fee = BalanceReservation.objects.select_for_update().filter(
        advertisement=advertisement,
        purpose=BalanceReservation.PURPOSE_CLIENT_COMMISSION,
        status=BalanceReservation.STATUS_HELD,
    ).first()
    if fee_settings.is_enabled and fee_settings.client_fee_enabled:
        fee = existing_fee
        if fee is None:
            fee = _reserve(
                user=advertisement.client,
                balance_type=AccountBalance.TYPE_COMMISSION,
                currency=fee_settings.currency,
                amount=fee_settings.client_fee_amount,
                advertisement=advertisement,
                purpose=BalanceReservation.PURPOSE_CLIENT_COMMISSION,
            )
        if fee:
            reservations.append(fee)
    elif existing_fee:
        _release_reservation(existing_fee, reason='Client commission disabled before assignment')
    return [item for item in reservations if item]


@transaction.atomic
def fund_order_assignment(
    advertisement,
    driver,
    agreed_amount: Decimal,
    order,
    *,
    actor=None,
) -> list[BalanceReservation]:
    """Validate both parties, bind the order hold, and charge fixed commissions."""
    if not prepaid_balances_enabled():
        return []
    order_reservation = None
    client_commission = None
    driver_commission = None

    if not is_staff_account(advertisement.client):
        order_reservation = _reserve(
            user=advertisement.client,
            balance_type=AccountBalance.TYPE_ORDER,
            currency=advertisement.currency,
            amount=agreed_amount,
            advertisement=advertisement,
            purpose=BalanceReservation.PURPOSE_CLIENT_ORDER,
            owner='user' if actor and actor.pk == advertisement.client_id else 'counterparty',
        )
        fee_settings = get_commission_settings()
        existing_client_commission = BalanceReservation.objects.select_for_update().filter(
            advertisement=advertisement,
            purpose=BalanceReservation.PURPOSE_CLIENT_COMMISSION,
            status=BalanceReservation.STATUS_HELD,
        ).first()
        if fee_settings.is_enabled and fee_settings.client_fee_enabled:
            client_commission = existing_client_commission
            if client_commission is None:
                client_commission = _reserve(
                    user=advertisement.client,
                    balance_type=AccountBalance.TYPE_COMMISSION,
                    currency=fee_settings.currency,
                    amount=fee_settings.client_fee_amount,
                    advertisement=advertisement,
                    purpose=BalanceReservation.PURPOSE_CLIENT_COMMISSION,
                    owner='user' if actor and actor.pk == advertisement.client_id else 'counterparty',
                )
        elif existing_client_commission:
            _release_reservation(
                existing_client_commission,
                reason='Client commission disabled before assignment',
            )
    else:
        fee_settings = get_commission_settings()

    if not is_staff_account(driver) and fee_settings.is_enabled and fee_settings.driver_fee_enabled:
        driver_commission = _reserve(
            user=driver,
            balance_type=AccountBalance.TYPE_COMMISSION,
            currency=fee_settings.currency,
            amount=fee_settings.driver_fee_amount,
            advertisement=advertisement,
            purpose=BalanceReservation.PURPOSE_DRIVER_COMMISSION,
            owner='user' if actor and actor.pk == driver.pk else 'counterparty',
        )

    if order_reservation:
        order_reservation.order = order
        order_reservation.save(update_fields=['order', 'updated_at'])
    if client_commission:
        _capture_reservation(client_commission, order=order, reason='Client commission charged on assignment')
    if driver_commission:
        _capture_reservation(driver_commission, order=order, reason='Driver commission charged on assignment')

    order.client_paid_reported = True
    order.client_paid_reported_at = timezone.now()
    order.client_payment_confirmed = True
    order.client_payment_confirmed_at = timezone.now()
    order.save(update_fields=[
        'client_paid_reported',
        'client_paid_reported_at',
        'client_payment_confirmed',
        'client_payment_confirmed_at',
        'updated_at',
    ])
    return [item for item in (order_reservation, client_commission, driver_commission) if item]


@transaction.atomic
def release_advertisement_reservations(advertisement, *, reason: str = 'Advertisement closed') -> None:
    reservations = BalanceReservation.objects.select_for_update().filter(
        advertisement=advertisement,
        status=BalanceReservation.STATUS_HELD,
    )
    for reservation in reservations:
        _release_reservation(reservation, reason=reason)


@transaction.atomic
def release_order_funds(order, *, reason: str = 'Order cancelled') -> Decimal:
    reservation = BalanceReservation.objects.select_for_update().filter(
        order=order,
        purpose=BalanceReservation.PURPOSE_CLIENT_ORDER,
        status=BalanceReservation.STATUS_HELD,
    ).first()
    if reservation:
        _release_reservation(reservation, reason=reason)
        return money(reservation.amount)
    return ZERO


@transaction.atomic
def settle_prepaid_order(order) -> BalanceReservation | None:
    reservation = BalanceReservation.objects.select_for_update().filter(
        order=order,
        purpose=BalanceReservation.PURPOSE_CLIENT_ORDER,
    ).first()
    if not reservation:
        return None
    if reservation.status == BalanceReservation.STATUS_CAPTURED:
        return reservation
    if reservation.status != BalanceReservation.STATUS_HELD:
        return None

    # The existing driver wallet and payout flow are UZS-based. USD orders keep
    # their original amount in the reservation and use the rate locked when the
    # order funds were reserved.
    from apps.payments.ledger import credit_available, ensure_wallet
    from apps.payments.models import LedgerEntry

    ensure_wallet(order.driver)
    _capture_reservation(reservation, order=order, reason='Order funds paid to driver')
    rate = money(reservation.settlement_uzs_rate or (1 if reservation.currency == 'UZS' else 0))
    if rate <= ZERO:
        raise ValueError('USD settlement rate is missing')
    payout_uzs = money(reservation.balance_amount)
    credit_available(
        order.driver,
        payout_uzs,
        entry_type=LedgerEntry.TYPE_ESCROW_RELEASE,
        idempotency_key=f'prepaid_complete:{order.id}',
        note=f'Prepaid order settlement for order #{order.id}',
        order=order,
        metadata={
            'source': 'prepaid_order_balance',
            'original_amount': str(reservation.amount),
            'original_currency': reservation.currency,
            'settlement_uzs_rate': str(rate),
        },
    )
    return reservation


def order_has_funding(order) -> bool:
    amount = money(order.total_amount)
    return BalanceReservation.objects.filter(
        order=order,
        purpose=BalanceReservation.PURPOSE_CLIENT_ORDER,
        status__in=[BalanceReservation.STATUS_HELD, BalanceReservation.STATUS_CAPTURED],
        amount__gte=amount,
        currency=normalize_currency(order.advertisement.currency),
    ).exists()


def balances_payload(user, requested_role: str | None = None) -> dict:
    commission_settings = get_commission_settings()
    exchange_rate_settings = get_exchange_rate_settings()
    allowed_roles = []
    if getattr(user, 'is_client', False):
        allowed_roles.append('client')
    if getattr(user, 'is_driver', False):
        allowed_roles.append('driver')
    role = requested_role if requested_role in allowed_roles else (allowed_roles[0] if allowed_roles else 'client')

    visible_types = [AccountBalance.TYPE_COMMISSION]
    if role == 'client':
        visible_types.insert(0, AccountBalance.TYPE_ORDER)

    currencies = ['UZS', 'USD']
    exchange_rate = money(exchange_rate_settings.usd_to_uzs)
    items = []
    for balance_type in visible_types:
        balance = get_balance(user, balance_type)
        display = {}
        for currency in currencies:
            available = convert_currency(
                balance.available,
                balance.currency,
                currency,
                usd_to_uzs=exchange_rate,
            )
            reserved = convert_currency(
                balance.reserved,
                balance.currency,
                currency,
                usd_to_uzs=exchange_rate,
            )
            display[currency] = {
                'available': float(available),
                'reserved': float(reserved),
                'total': float(money(available + reserved)),
            }
        items.append({
            'id': balance.id,
            'type': balance.balance_type,
            'base_currency': balance.currency,
            'available': float(balance.available),
            'reserved': float(balance.reserved),
            'total': float(money(balance.available + balance.reserved)),
            'display': display,
        })

    fee_enabled = (
        commission_settings.driver_fee_enabled if role == 'driver' else commission_settings.client_fee_enabled
    )
    fee_amount = (
        commission_settings.driver_fee_amount if role == 'driver' else commission_settings.client_fee_amount
    )
    fee_display = {
        currency: float(convert_currency(
            fee_amount,
            commission_settings.currency,
            currency,
            usd_to_uzs=exchange_rate,
        ))
        for currency in currencies
    }
    return {
        'balances': items,
        'commission': {
            'enabled': bool(commission_settings.is_enabled and fee_enabled),
            'amount_per_order': float(fee_amount),
            'currency': commission_settings.currency,
            'display': fee_display,
            'role': role,
        },
        'supported_currencies': currencies,
        'top_up_exchange': {
            'gateway_currency': 'UZS',
            'usd_to_uzs': float(exchange_rate_settings.usd_to_uzs),
        },
    }
