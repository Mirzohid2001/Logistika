from __future__ import annotations

import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.orders.financial import resolved_order_amount
from apps.orders.models import Order
from apps.payments.ledger import (
    ZERO,
    credit_available,
    debit_available,
    ensure_wallet,
    hold_available,
    money,
    record_platform_commission,
    release_hold,
    capture_hold,
)
from apps.payments.models import LedgerEntry, OrderEscrow, Payment
from apps.ratings.models import Complaint

logger = logging.getLogger(__name__)


def commission_percent() -> Decimal:
    return money(getattr(settings, 'PLATFORM_COMMISSION_PERCENT', 10))


def client_cancel_fee_percent(status_code: str) -> Decimal:
    if status_code in ('in_progress', 'in_transit'):
        return money(getattr(settings, 'CANCELLATION_FEE_CLIENT_AFTER_START_PERCENT', 20))
    return money(getattr(settings, 'CANCELLATION_FEE_CLIENT_BEFORE_START_PERCENT', 0))


def driver_cancel_fee_percent(status_code: str) -> Decimal:
    if status_code in ('in_progress', 'in_transit'):
        return money(getattr(settings, 'CANCELLATION_FEE_DRIVER_AFTER_START_PERCENT', 10))
    return ZERO


def get_or_create_escrow(order: Order) -> OrderEscrow:
    escrow, _created = OrderEscrow.objects.get_or_create(order=order)
    return escrow


def _remaining_escrow(escrow: OrderEscrow) -> Decimal:
    return money(
        escrow.funded_amount
        - escrow.released_to_driver
        - escrow.commission_amount
        - escrow.refunded_amount
        - escrow.cancellation_fee
    )


@transaction.atomic
def fund_escrow_from_payment(payment: Payment) -> OrderEscrow | None:
    if not payment.order_id or payment.completion_fee_id:
        return None
    if payment.payment_status != 'completed':
        return None

    order = Order.objects.select_for_update().select_related('status').get(pk=payment.order_id)
    escrow = get_or_create_escrow(order)
    amount = money(payment.amount)

    existing = LedgerEntry.objects.filter(idempotency_key=f'escrow_fund:{payment.id}').first()
    if existing:
        return escrow

    LedgerEntry.objects.create(
        wallet=None,
        user=order.client,
        order=order,
        payment=payment,
        entry_type=LedgerEntry.TYPE_ESCROW_FUND,
        amount=amount,
        idempotency_key=f'escrow_fund:{payment.id}',
        note=f'Escrow funded from payment #{payment.id}',
        metadata={'order_id': order.id, 'payment_id': payment.id},
    )

    escrow.funded_amount = money(escrow.funded_amount + amount)
    if escrow.status in (OrderEscrow.STATUS_EMPTY, OrderEscrow.STATUS_REFUNDED, OrderEscrow.STATUS_CANCELLED):
        escrow.status = OrderEscrow.STATUS_FUNDED
    escrow.funded_at = escrow.funded_at or timezone.now()
    escrow.save(update_fields=['funded_amount', 'status', 'funded_at', 'updated_at'])

    if not order.client_payment_confirmed:
        order.client_payment_confirmed = True
        order.client_payment_confirmed_at = timezone.now()
        order.save(update_fields=['client_payment_confirmed', 'client_payment_confirmed_at', 'updated_at'])

    logger.info(
        'Escrow funded',
        extra={'event': 'escrow_fund', 'order_id': order.id, 'user_id': order.client_id},
    )
    return escrow


@transaction.atomic
def settle_driver_on_complete(order: Order) -> OrderEscrow | None:
    """Release escrow or credit offline settlement after the order is completed."""
    ensure_wallet(order.driver)
    try:
        escrow = order.escrow
    except OrderEscrow.DoesNotExist:
        escrow = None

    if escrow and escrow.status in (OrderEscrow.STATUS_FUNDED, OrderEscrow.STATUS_HELD):
        return release_escrow_on_complete(order)

    if not order.client_payment_confirmed:
        return escrow

    amount = money(resolved_order_amount(order))
    if amount <= ZERO:
        return escrow

    credit_available(
        order.driver,
        amount,
        entry_type=LedgerEntry.TYPE_ESCROW_RELEASE,
        idempotency_key=f'offline_complete:{order.id}',
        note=f'Offline settlement for order #{order.id}',
        order=order,
    )
    return escrow


@transaction.atomic
def release_escrow_on_complete(order: Order) -> OrderEscrow | None:
    order = Order.objects.select_for_update().select_related('driver', 'client', 'status').get(pk=order.pk)
    try:
        escrow = order.escrow
    except OrderEscrow.DoesNotExist:
        return None

    if escrow.status == OrderEscrow.STATUS_HELD:
        logger.info(
            'Escrow release skipped — dispute hold',
            extra={'event': 'escrow_release_held', 'order_id': order.id},
        )
        return escrow
    if escrow.status in (OrderEscrow.STATUS_RELEASED, OrderEscrow.STATUS_REFUNDED, OrderEscrow.STATUS_CANCELLED):
        return escrow
    if escrow.status != OrderEscrow.STATUS_FUNDED:
        return escrow

    remaining = _remaining_escrow(escrow)
    if remaining <= ZERO:
        escrow.status = OrderEscrow.STATUS_RELEASED
        escrow.released_at = timezone.now()
        escrow.save(update_fields=['status', 'released_at', 'updated_at'])
        return escrow

    rate = commission_percent() / Decimal('100')
    commission = money(remaining * rate)
    driver_share = money(remaining - commission)

    if driver_share > ZERO:
        credit_available(
            order.driver,
            driver_share,
            entry_type=LedgerEntry.TYPE_ESCROW_RELEASE,
            idempotency_key=f'escrow_release:{order.id}',
            note=f'Escrow released for order #{order.id}',
            order=order,
            metadata={'commission': str(commission)},
        )
    if commission > ZERO:
        record_platform_commission(
            commission,
            idempotency_key=f'commission:{order.id}',
            note=f'Platform commission for order #{order.id}',
            order=order,
        )

    escrow.released_to_driver = money(escrow.released_to_driver + driver_share)
    escrow.commission_amount = money(escrow.commission_amount + commission)
    escrow.status = OrderEscrow.STATUS_RELEASED
    escrow.released_at = timezone.now()
    escrow.save(update_fields=[
        'released_to_driver', 'commission_amount', 'status', 'released_at', 'updated_at',
    ])
    logger.info(
        'Escrow released',
        extra={'event': 'escrow_release', 'order_id': order.id, 'user_id': order.driver_id},
    )
    return escrow


def _refund_escrow_amount(order: Order, escrow: OrderEscrow, amount: Decimal, *, key_suffix: str) -> Decimal:
    amount = min(money(amount), _remaining_escrow(escrow))
    if amount <= ZERO:
        return ZERO

    payment = (
        Payment.objects.filter(
            order=order,
            payment_status='completed',
            completion_fee__isnull=True,
        )
        .order_by('-paid_at', '-id')
        .first()
    )
    if payment:
        from apps.payments.order_payment import record_payment_refund

        try:
            record_payment_refund(payment, amount, reason=f'escrow:{key_suffix}')
        except Exception:
            logger.exception(
                'Payment refund failed, crediting client wallet',
                extra={'event': 'escrow_refund_fallback', 'order_id': order.id},
            )
            credit_available(
                order.client,
                amount,
                entry_type=LedgerEntry.TYPE_REFUND,
                idempotency_key=f'refund_wallet:{order.id}:{key_suffix}',
                note=f'Escrow refund to wallet for order #{order.id}',
                order=order,
                payment=payment,
            )
    else:
        credit_available(
            order.client,
            amount,
            entry_type=LedgerEntry.TYPE_REFUND,
            idempotency_key=f'refund_wallet:{order.id}:{key_suffix}',
            note=f'Escrow refund to wallet for order #{order.id}',
            order=order,
        )

    escrow.refunded_amount = money(escrow.refunded_amount + amount)
    return amount


@transaction.atomic
def settle_order_cancellation(order: Order, *, actor: str) -> dict:
    """actor: client | driver | dispatcher"""
    order = Order.objects.select_for_update().select_related('driver', 'client', 'status').get(pk=order.pk)
    status_code = order.status.code if order.status else ''
    gross = money(resolved_order_amount(order))

    if actor == 'client':
        fee_percent = client_cancel_fee_percent(status_code)
        fee_to = 'driver'
    elif actor == 'driver':
        fee_percent = driver_cancel_fee_percent(status_code)
        fee_to = 'client'
    else:
        fee_percent = ZERO
        fee_to = None

    fee = money(gross * (fee_percent / Decimal('100'))) if fee_percent else ZERO
    result = {'fee': float(fee), 'fee_to': fee_to, 'refunded': 0.0, 'actor': actor}

    try:
        escrow = order.escrow
    except OrderEscrow.DoesNotExist:
        escrow = None

    if escrow and escrow.status in (OrderEscrow.STATUS_FUNDED, OrderEscrow.STATUS_HELD):
        remaining = _remaining_escrow(escrow)
        fee = min(fee, remaining)
        if fee > ZERO and fee_to == 'driver':
            credit_available(
                order.driver,
                fee,
                entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
                idempotency_key=f'cancel_fee:{order.id}',
                note=f'Client cancellation fee for order #{order.id}',
                order=order,
            )
            escrow.cancellation_fee = money(escrow.cancellation_fee + fee)
        elif fee > ZERO and fee_to == 'client':
            credit_available(
                order.client,
                fee,
                entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
                idempotency_key=f'cancel_fee:{order.id}',
                note=f'Driver cancellation fee for order #{order.id}',
                order=order,
            )
            escrow.cancellation_fee = money(escrow.cancellation_fee + fee)
            try:
                debit_available(
                    order.driver,
                    fee,
                    entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
                    idempotency_key=f'cancel_fee_debit:{order.id}',
                    note=f'Driver cancellation penalty for order #{order.id}',
                    order=order,
                )
            except ValueError:
                logger.warning(
                    'Driver cancellation fee not collected — insufficient wallet',
                    extra={'event': 'cancel_fee_uncollected', 'order_id': order.id},
                )

        refunded = _refund_escrow_amount(order, escrow, _remaining_escrow(escrow), key_suffix='cancel')
        escrow.status = OrderEscrow.STATUS_CANCELLED
        escrow.save(update_fields=[
            'cancellation_fee', 'refunded_amount', 'status', 'updated_at',
        ])
        result['refunded'] = float(refunded)
        result['fee'] = float(fee)
        return result

    if fee > ZERO and fee_to == 'driver':
        # Offline: record fee as driver credit so payouts include it.
        credit_available(
            order.driver,
            fee,
            entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
            idempotency_key=f'cancel_fee:{order.id}',
            note=f'Offline cancellation fee for order #{order.id}',
            order=order,
        )
        escrow = get_or_create_escrow(order)
        escrow.cancellation_fee = money(escrow.cancellation_fee + fee)
        escrow.status = OrderEscrow.STATUS_CANCELLED
        escrow.save(update_fields=['cancellation_fee', 'status', 'updated_at'])
    elif fee > ZERO and fee_to == 'client':
        try:
            debit_available(
                order.driver,
                fee,
                entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
                idempotency_key=f'cancel_fee_debit:{order.id}',
                note=f'Driver cancellation penalty for order #{order.id}',
                order=order,
            )
            credit_available(
                order.client,
                fee,
                entry_type=LedgerEntry.TYPE_CANCELLATION_FEE,
                idempotency_key=f'cancel_fee:{order.id}',
                note=f'Driver cancellation fee to client for order #{order.id}',
                order=order,
            )
        except ValueError:
            logger.warning(
                'Driver cancellation fee not collected — insufficient wallet',
                extra={'event': 'cancel_fee_uncollected', 'order_id': order.id},
            )

    result['fee'] = float(fee)
    return result


@transaction.atomic
def hold_on_complaint(complaint: Complaint) -> None:
    order = Order.objects.select_for_update().select_related('driver').get(pk=complaint.order_id)
    try:
        escrow = order.escrow
    except OrderEscrow.DoesNotExist:
        escrow = None

    if escrow and escrow.status == OrderEscrow.STATUS_FUNDED:
        escrow.status = OrderEscrow.STATUS_HELD
        escrow.held_at = timezone.now()
        escrow.save(update_fields=['status', 'held_at', 'updated_at'])
        logger.info(
            'Escrow held for complaint',
            extra={'event': 'dispute_hold_escrow', 'order_id': order.id},
        )
        return

    hold_amount = ZERO
    if escrow and escrow.status == OrderEscrow.STATUS_RELEASED:
        hold_amount = money(escrow.released_to_driver)
    else:
        hold_amount = money(resolved_order_amount(order))

    hold_available(
        order.driver,
        hold_amount,
        entry_type=LedgerEntry.TYPE_DISPUTE_HOLD,
        idempotency_key=f'dispute_hold:{complaint.id}',
        note=f'Dispute hold for complaint #{complaint.id}',
        order=order,
        complaint=complaint,
    )
    logger.info(
        'Driver wallet held for complaint',
        extra={'event': 'dispute_hold_wallet', 'order_id': order.id, 'user_id': order.driver_id},
    )


@transaction.atomic
def resolve_complaint_settlement(complaint: Complaint, *, settlement: str, driver_share: Decimal | None = None) -> dict:
    """
    settlement:
      release — money stays with / goes to driver
      refund — money returns to client
      split — driver_share to driver, rest to client
    """
    order = Order.objects.select_for_update().select_related('driver', 'client').get(pk=complaint.order_id)
    try:
        escrow = order.escrow
    except OrderEscrow.DoesNotExist:
        escrow = None

    result = {'settlement': settlement}

    if escrow and escrow.status == OrderEscrow.STATUS_HELD:
        remaining = _remaining_escrow(escrow)
        if settlement == 'refund':
            refunded = _refund_escrow_amount(order, escrow, remaining, key_suffix=f'complaint:{complaint.id}')
            escrow.status = OrderEscrow.STATUS_REFUNDED
            escrow.save(update_fields=['refunded_amount', 'status', 'updated_at'])
            result['refunded'] = float(refunded)
        elif settlement == 'split':
            share = money(driver_share or 0)
            share = min(share, remaining)
            if share > ZERO:
                credit_available(
                    order.driver,
                    share,
                    entry_type=LedgerEntry.TYPE_ESCROW_RELEASE,
                    idempotency_key=f'dispute_split_driver:{complaint.id}',
                    note=f'Dispute split to driver for complaint #{complaint.id}',
                    order=order,
                    complaint=complaint,
                )
                escrow.released_to_driver = money(escrow.released_to_driver + share)
            refunded = _refund_escrow_amount(
                order, escrow, _remaining_escrow(escrow), key_suffix=f'complaint-split:{complaint.id}',
            )
            escrow.status = OrderEscrow.STATUS_RELEASED
            escrow.released_at = timezone.now()
            escrow.save(update_fields=['released_to_driver', 'refunded_amount', 'status', 'released_at', 'updated_at'])
            result.update({'driver_share': float(share), 'refunded': float(refunded)})
        else:
            escrow.status = OrderEscrow.STATUS_FUNDED
            escrow.save(update_fields=['status', 'updated_at'])
            if order.status and order.status.code == 'completed':
                release_escrow_on_complete(order)
            result['released'] = True
        return result

    hold_entry = LedgerEntry.objects.filter(
        idempotency_key=f'dispute_hold:{complaint.id}',
        entry_type=LedgerEntry.TYPE_DISPUTE_HOLD,
    ).first()
    held_amount = money(hold_entry.amount) if hold_entry else ZERO

    if held_amount <= ZERO:
        return result

    if settlement == 'refund':
        capture_hold(
            order.driver,
            held_amount,
            entry_type=LedgerEntry.TYPE_REFUND,
            idempotency_key=f'dispute_capture:{complaint.id}',
            note=f'Dispute clawback for complaint #{complaint.id}',
            order=order,
            complaint=complaint,
        )
        credit_available(
            order.client,
            held_amount,
            entry_type=LedgerEntry.TYPE_REFUND,
            idempotency_key=f'dispute_refund_client:{complaint.id}',
            note=f'Dispute refund to client for complaint #{complaint.id}',
            order=order,
            complaint=complaint,
        )
        result['refunded'] = float(held_amount)
    elif settlement == 'split':
        share = money(driver_share or 0)
        share = min(share, held_amount)
        client_share = money(held_amount - share)
        if share > ZERO:
            release_hold(
                order.driver,
                share,
                entry_type=LedgerEntry.TYPE_DISPUTE_RELEASE,
                idempotency_key=f'dispute_split_release:{complaint.id}',
                note=f'Dispute split back to driver for complaint #{complaint.id}',
                order=order,
                complaint=complaint,
            )
        if client_share > ZERO:
            capture_hold(
                order.driver,
                client_share,
                entry_type=LedgerEntry.TYPE_REFUND,
                idempotency_key=f'dispute_split_capture:{complaint.id}',
                note=f'Dispute split clawback for complaint #{complaint.id}',
                order=order,
                complaint=complaint,
            )
            credit_available(
                order.client,
                client_share,
                entry_type=LedgerEntry.TYPE_REFUND,
                idempotency_key=f'dispute_split_client:{complaint.id}',
                note=f'Dispute split to client for complaint #{complaint.id}',
                order=order,
                complaint=complaint,
            )
        result.update({'driver_share': float(share), 'refunded': float(client_share)})
    else:
        release_hold(
            order.driver,
            held_amount,
            entry_type=LedgerEntry.TYPE_DISPUTE_RELEASE,
            idempotency_key=f'dispute_release:{complaint.id}',
            note=f'Dispute dismissed for complaint #{complaint.id}',
            order=order,
            complaint=complaint,
        )
        result['released'] = True

    return result
