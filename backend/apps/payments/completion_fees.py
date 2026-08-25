from __future__ import annotations

import logging
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Sum
from django.utils import timezone

from apps.common.exceptions import PermissionDeniedError
from apps.users.roles import is_staff_account

from .models import OrderCompletionFee, OrderCompletionFeeSettings, Payment

logger = logging.getLogger(__name__)

SERVICE_FEE_REQUIRED_CODE = 'service_fee_required'


def get_completion_fee_settings() -> OrderCompletionFeeSettings | None:
    return OrderCompletionFeeSettings.objects.filter(pk=1).first()


def create_completion_fees_for_order(order) -> list[OrderCompletionFee]:
    """Snapshot current admin settings into immutable per-order obligations."""
    if not order.pk or not order.status_id or order.status.code != 'completed':
        return []

    fee_settings = get_completion_fee_settings()
    if not fee_settings or not fee_settings.is_enabled:
        return []

    specs = [
        (
            OrderCompletionFee.ROLE_CLIENT,
            order.client_id,
            fee_settings.client_fee_enabled,
            fee_settings.client_fee_amount,
        ),
        (
            OrderCompletionFee.ROLE_DRIVER,
            order.driver_id,
            fee_settings.driver_fee_enabled,
            fee_settings.driver_fee_amount,
        ),
    ]
    created_fees: list[OrderCompletionFee] = []
    for role, user_id, role_enabled, raw_amount in specs:
        amount = Decimal(str(raw_amount or 0))
        if not role_enabled or not user_id or amount <= 0:
            continue
        fee, created = OrderCompletionFee.objects.get_or_create(
            order_id=order.id,
            role=role,
            defaults={
                'user_id': user_id,
                'amount': amount,
                'currency': fee_settings.currency,
            },
        )
        if created:
            created_fees.append(fee)

    if created_fees:
        transaction.on_commit(lambda: _notify_new_fees(created_fees))
    return created_fees


def _notify_new_fees(fees: list[OrderCompletionFee]) -> None:
    from apps.notifications.services import create_notification

    for fee in fees:
        try:
            create_notification(
                user=fee.user,
                notification_type='system',
                title='Xizmat to\'lovi kutilmoqda',
                message=(
                    f'Buyurtma #{fee.order_id} yakunlandi. Keyingi buyurtmadan oldin '
                    f'{fee.amount} {fee.currency} xizmat to\'lovini amalga oshiring.'
                ),
                order=fee.order,
                extra_push_data={'completion_fee_id': fee.id},
            )
        except Exception:
            logger.exception(
                'Failed to notify user about order completion fee',
                extra={'event': 'completion_fee_notify_failed', 'fee_id': fee.id},
            )


def pending_completion_fees(user):
    if not user or not getattr(user, 'is_authenticated', False):
        return OrderCompletionFee.objects.none()
    return OrderCompletionFee.objects.filter(
        user=user,
        status=OrderCompletionFee.STATUS_PENDING,
    )


def completion_fee_summary(user) -> dict:
    rows = list(
        pending_completion_fees(user)
        .values('currency')
        .annotate(amount=Sum('amount'), count=Count('id'))
        .order_by('currency')
    )
    totals = [
        {
            'currency': row['currency'],
            'amount': float(row['amount'] or 0),
            'count': row['count'],
        }
        for row in rows
    ]
    pending_count = sum(item['count'] for item in totals)
    required = pending_count > 0 and not is_staff_account(user)
    return {
        'required': required,
        'marketplace_actions_allowed': not required,
        'pending_count': pending_count,
        'totals': totals,
    }


def completion_fee_error_payload(user) -> dict | None:
    summary = completion_fee_summary(user)
    if not summary['required']:
        return None
    amounts = ', '.join(f"{item['amount']:g} {item['currency']}" for item in summary['totals'])
    return {
        'error': (
            f'Avval yakunlangan buyurtma uchun xizmat to\'lovini to\'lang: {amounts}. '
            'Shundan keyin yangi buyurtma bilan ishlashingiz mumkin.'
        ),
        'code': SERVICE_FEE_REQUIRED_CODE,
        'service_fee': summary,
    }


def completion_fee_forbidden_response(user):
    payload = completion_fee_error_payload(user)
    if not payload:
        return None
    from rest_framework import status
    from rest_framework.response import Response

    return Response(payload, status=status.HTTP_403_FORBIDDEN)


def counterparty_completion_fee_forbidden_response(user, *, label: str):
    summary = completion_fee_summary(user)
    if not summary['required']:
        return None
    from rest_framework import status
    from rest_framework.response import Response

    return Response(
        {
            'error': f'{label} oldingi buyurtma xizmat to\'lovini hali to\'lamagan.',
            'code': 'counterparty_service_fee_required',
        },
        status=status.HTTP_403_FORBIDDEN,
    )


def ensure_no_pending_completion_fees(user) -> None:
    payload = completion_fee_error_payload(user)
    if payload:
        raise PermissionDeniedError(
            detail=payload['error'],
            code=SERVICE_FEE_REQUIRED_CODE,
        )


@transaction.atomic
def settle_completion_fee_payment(payment: Payment) -> OrderCompletionFee | None:
    if not payment.completion_fee_id or payment.payment_status != 'completed':
        return None

    fee = OrderCompletionFee.objects.select_for_update().get(pk=payment.completion_fee_id)
    if fee.status in (OrderCompletionFee.STATUS_PAID, OrderCompletionFee.STATUS_WAIVED):
        return fee
    if fee.user_id != payment.user_id:
        raise PermissionDeniedError(detail='To\'lov egasi xizmat to\'lovi egasiga mos emas')
    if fee.amount != payment.amount or fee.currency != payment.currency:
        raise PermissionDeniedError(detail='To\'lov summasi xizmat to\'lovi summasiga mos emas')

    fee.status = OrderCompletionFee.STATUS_PAID
    fee.paid_payment = payment
    fee.paid_at = payment.paid_at or timezone.now()
    fee.save(update_fields=['status', 'paid_payment', 'paid_at', 'updated_at'])
    return fee
