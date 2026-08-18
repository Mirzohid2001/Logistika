from __future__ import annotations

import logging
from decimal import Decimal, ROUND_HALF_UP

from django.db import transaction

from apps.users.models import User
from .models import LedgerEntry, Wallet

logger = logging.getLogger(__name__)

ZERO = Decimal('0.00')
CENT = Decimal('0.01')


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def get_wallet(user: User, *, for_update: bool = False) -> Wallet:
    qs = Wallet.objects
    if for_update:
        qs = qs.select_for_update()
    wallet, _created = qs.get_or_create(user=user, defaults={'available': ZERO, 'held': ZERO})
    return wallet


def seed_legacy_wallet(user: User, wallet: Wallet) -> Wallet:
    if wallet.legacy_seeded:
        return wallet

    from apps.orders.financial import driver_gross_settled_earnings, driver_payout_reserved

    amount = ZERO
    if getattr(user, 'is_driver', False):
        amount = money(driver_gross_settled_earnings(user) - driver_payout_reserved(user))
        if amount > ZERO:
            _write_entry(
                wallet=wallet,
                user=user,
                entry_type=LedgerEntry.TYPE_LEGACY_SEED,
                amount=amount,
                available_delta=amount,
                idempotency_key=f'legacy_seed:{user.id}',
                note='Seeded from settled offline earnings',
            )
            wallet.refresh_from_db()

    wallet.legacy_seeded = True
    wallet.save(update_fields=['legacy_seeded', 'updated_at'])
    return wallet


@transaction.atomic
def ensure_wallet(user: User) -> Wallet:
    wallet = get_wallet(user, for_update=True)
    return seed_legacy_wallet(user, wallet)


def _write_entry(
    *,
    wallet: Wallet | None,
    user: User | None,
    entry_type: str,
    amount: Decimal,
    available_delta: Decimal = ZERO,
    held_delta: Decimal = ZERO,
    idempotency_key: str,
    note: str = '',
    order=None,
    payment=None,
    complaint=None,
    payout_request=None,
    metadata: dict | None = None,
) -> LedgerEntry | None:
    amount = money(amount)
    available_delta = money(available_delta)
    held_delta = money(held_delta)
    if amount <= ZERO and available_delta == ZERO and held_delta == ZERO:
        return None

    existing = LedgerEntry.objects.filter(idempotency_key=idempotency_key).first()
    if existing:
        return existing

    if wallet is not None:
        if available_delta:
            wallet.available = money(wallet.available + available_delta)
        if held_delta:
            wallet.held = money(wallet.held + held_delta)
        if wallet.available < ZERO or wallet.held < ZERO:
            raise ValueError('Wallet balance cannot go negative')
        wallet.save(update_fields=['available', 'held', 'updated_at'])

    return LedgerEntry.objects.create(
        wallet=wallet,
        user=user,
        order=order,
        payment=payment,
        complaint=complaint,
        payout_request=payout_request,
        entry_type=entry_type,
        amount=amount,
        available_delta=available_delta,
        held_delta=held_delta,
        idempotency_key=idempotency_key,
        note=note,
        metadata=metadata or {},
    )


def credit_available(user: User, amount: Decimal, **kwargs) -> LedgerEntry | None:
    amount = money(amount)
    wallet = get_wallet(user, for_update=True)
    seed_legacy_wallet(user, wallet)
    return _write_entry(
        wallet=wallet,
        user=user,
        amount=amount,
        available_delta=amount,
        **kwargs,
    )


def debit_available(user: User, amount: Decimal, **kwargs) -> LedgerEntry | None:
    amount = money(amount)
    wallet = get_wallet(user, for_update=True)
    seed_legacy_wallet(user, wallet)
    if money(wallet.available) < amount:
        raise ValueError('Insufficient wallet balance')
    return _write_entry(
        wallet=wallet,
        user=user,
        amount=amount,
        available_delta=-amount,
        **kwargs,
    )


def hold_available(user: User, amount: Decimal, **kwargs) -> LedgerEntry | None:
    amount = money(amount)
    wallet = get_wallet(user, for_update=True)
    seed_legacy_wallet(user, wallet)
    hold_amount = min(amount, money(wallet.available))
    if hold_amount <= ZERO:
        return None
    return _write_entry(
        wallet=wallet,
        user=user,
        amount=hold_amount,
        available_delta=-hold_amount,
        held_delta=hold_amount,
        **kwargs,
    )


def release_hold(user: User, amount: Decimal, **kwargs) -> LedgerEntry | None:
    amount = money(amount)
    wallet = get_wallet(user, for_update=True)
    seed_legacy_wallet(user, wallet)
    release_amount = min(amount, money(wallet.held))
    if release_amount <= ZERO:
        return None
    return _write_entry(
        wallet=wallet,
        user=user,
        amount=release_amount,
        available_delta=release_amount,
        held_delta=-release_amount,
        **kwargs,
    )


def capture_hold(user: User, amount: Decimal, **kwargs) -> LedgerEntry | None:
    """Remove held funds without returning them to available (refund/clawback)."""
    amount = money(amount)
    wallet = get_wallet(user, for_update=True)
    seed_legacy_wallet(user, wallet)
    capture_amount = min(amount, money(wallet.held))
    if capture_amount <= ZERO:
        return None
    return _write_entry(
        wallet=wallet,
        user=user,
        amount=capture_amount,
        held_delta=-capture_amount,
        **kwargs,
    )


def record_platform_commission(amount: Decimal, **kwargs) -> LedgerEntry | None:
    amount = money(amount)
    return _write_entry(
        wallet=None,
        user=None,
        entry_type=LedgerEntry.TYPE_COMMISSION,
        amount=amount,
        **kwargs,
    )


def wallet_payload(user: User) -> dict:
    wallet = ensure_wallet(user)
    return {
        'available': float(wallet.available),
        'held': float(wallet.held),
        'legacy_seeded': wallet.legacy_seeded,
        'currency': 'UZS',
    }
