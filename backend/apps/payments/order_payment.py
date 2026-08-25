import logging
from decimal import Decimal

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.common.exceptions import PermissionDeniedError, ValidationError
from apps.orders.models import Order

logger = logging.getLogger(__name__)


def order_platform_payments_enabled() -> bool:
    return bool(getattr(settings, 'ORDER_PLATFORM_PAYMENTS_ENABLED', False))


def lock_order_for_payment(order_id: int) -> Order:
    return Order.objects.select_for_update().get(pk=order_id)


def validate_order_payment_request(order: Order, *, user_id: int, amount: Decimal) -> Decimal:
    if not order_platform_payments_enabled():
        raise PermissionDeniedError(
            detail='Buyurtma to\'lovi platforma orqali o\'tmaydi. Shafyor va mijoz o\'zlari kelishadi.'
        )
    if order.client_id != user_id:
        raise PermissionDeniedError(detail='Faqat mijoz buyurtma uchun to\'lov qila oladi')
    if order.status.code in ['completed', 'cancelled', 'rejected']:
        raise ValidationError(detail='Yakunlangan yoki bekor qilingan buyurtma uchun to\'lov qilib bo\'lmaydi')

    remaining = Decimal(str(order.remaining_amount or 0))
    if remaining <= 0:
        raise ValidationError(detail='Buyurtma uchun to\'lov qoldig\'i yo\'q')
    payment_amount = Decimal(str(amount))
    if payment_amount > remaining:
        raise ValidationError(detail=f'To\'lov summasi qoldiqdan oshmasligi kerak ({remaining} so\'m)')
    return remaining


def sync_order_payment_confirmation(order) -> bool:
    """Buyurtma to'lovi haydovchi tomonidan belgilanadi — platforma aralashmaydi."""
    return False


def record_payment_refund(payment, amount: Decimal, *, reason: str = '') -> Decimal:
    amount = Decimal(str(amount or 0))
    refundable = payment.refundable_amount
    if amount <= 0 or refundable <= 0:
        return Decimal('0')
    amount = min(amount, refundable)
    previous = payment.refund_amount or Decimal('0')
    payment.refund_amount = previous + amount
    payment.refunded_at = payment.refunded_at or timezone.now()
    if reason:
        payment.refund_reason = reason
    if payment.refund_amount >= payment.amount:
        payment.payment_status = 'cancelled'
    payment.save(update_fields=[
        'refund_amount', 'refunded_at', 'refund_reason', 'payment_status', 'updated_at',
    ])
    return amount


def finalize_completed_payment(payment) -> None:
    from apps.notifications.services import create_notification

    if payment.completion_fee_id:
        from apps.payments.completion_fees import settle_completion_fee_payment

        fee = settle_completion_fee_payment(payment)
        if fee:
            try:
                create_notification(
                    user=payment.user,
                    notification_type='payment_received',
                    title='Xizmat to\'lovi qabul qilindi',
                    message=(
                        f'Buyurtma #{fee.order_id} uchun {fee.amount} {fee.currency} '
                        'xizmat to\'lovi qabul qilindi.'
                    ),
                    order=fee.order,
                )
            except Exception:
                logger.exception(
                    'Failed to notify user about completed service fee payment',
                    extra={'event': 'completion_fee_payment_notify_failed', 'payment_id': payment.id},
                )
        return

    _maybe_activate_subscription_payment(payment)

    if payment.order_id:
        try:
            from apps.payments.escrow import fund_escrow_from_payment

            fund_escrow_from_payment(payment)
        except Exception:
            logger.exception(
                'Failed to fund escrow from payment',
                extra={'event': 'escrow_fund_failed', 'order_id': payment.order_id},
            )
        return

    try:
        create_notification(
            user=payment.user,
            notification_type='payment_received',
            title='To\'lov qabul qilindi',
            message=f"To'lov #{payment.id} muvaffaqiyatli qabul qilindi. Summa: {payment.amount} so'm.",
        )
    except Exception:
        logger.exception(
            'Failed to notify user about completed payment',
            extra={'event': 'payment_notify_failed', 'user_id': payment.user_id},
        )


def _maybe_activate_subscription_payment(payment) -> None:
    gateway = payment.gateway_response if isinstance(payment.gateway_response, dict) else {}
    if gateway.get('purpose') != 'subscription':
        return
    if payment.payment_status != 'completed':
        return

    from apps.subscriptions.models import SubscriptionPlan, UserSubscription
    from apps.subscriptions.services import activate_subscription

    plan_id = gateway.get('plan_id')
    plan = None
    if plan_id:
        plan = SubscriptionPlan.objects.filter(pk=plan_id, is_active=True).first()
    if not plan:
        plan_code = gateway.get('plan_code')
        if plan_code:
            plan = SubscriptionPlan.objects.filter(code=plan_code, is_active=True).first()
    if not plan:
        return

    if UserSubscription.objects.filter(user=payment.user, status='active', payment=payment).exists():
        return

    activate_subscription(
        payment.user,
        plan,
        payment=payment,
        list_price=gateway.get('list_price'),
        charged_amount=gateway.get('charged_amount') or payment.amount,
        intro_discount_percent=int(gateway.get('intro_discount_percent') or 0),
        is_intro_purchase=bool(gateway.get('is_intro_purchase')),
    )


def mark_payment_completed(payment, *, gateway_response=None) -> None:
    payment.payment_status = 'completed'
    payment.paid_at = payment.paid_at or timezone.now()
    if gateway_response is not None:
        payment.gateway_response = gateway_response
    payment.save(update_fields=['payment_status', 'paid_at', 'gateway_response', 'updated_at'])
    finalize_completed_payment(payment)
