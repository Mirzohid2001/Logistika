"""Mijozga to'lov eslatmasi — platforma to'lovni qabul qilmaydi."""

from __future__ import annotations

from django.core.cache import cache
import logging

from apps.common.services import send_notification_sms
from apps.notifications.services import create_notification
from apps.orders.realtime import broadcast_order_payment_updated

logger = logging.getLogger(__name__)


REMINDER_COOLDOWN_SECONDS = 300


def notify_client_payment_needed(order, *, source: str = 'driver_unpaid') -> bool:
    """Mijozga to'lov eslatmasi: haydovchi kutmoqda yoki yuk qabul qilindi."""
    order.refresh_from_db()
    if order.is_payment_settled:
        return False

    cache_key = f'payment_reminder_order_{order.id}:{source}'
    if cache.get(cache_key):
        return False
    cache.set(cache_key, 1, REMINDER_COOLDOWN_SECONDS)

    amount = float(order.total_amount or 0)
    amount_suffix = f" ({amount:.0f} so'm)" if amount > 0 else ''
    if source == 'delivery_confirmed':
        title = "To'lovni amalga oshiring"
        message = (
            f"Buyurtma #{order.id}: yuk qabul qilindi. "
            f"Endi kelishilgan summani to'lang{amount_suffix}."
        )
    else:
        title = "To'lovni amalga oshiring"
        message = (
            f"Buyurtma #{order.id}: haydovchi to'lovni kutmoqda. "
            f"Iltimos, kelishilgan summani to'lang{amount_suffix}."
        )

    create_notification(
        user=order.client,
        notification_type='payment_received',
        title=title,
        message=message,
        order=order,
        send_push=True,
    )
    try:
        send_notification_sms(order.client.phone, message)
    except Exception:
        logger.exception(
            'Failed to send payment reminder SMS',
            extra={'event': 'payment_reminder_sms_failed', 'order_id': order.id},
        )

    broadcast_order_payment_updated(order)
    return True


def notify_driver_client_reported_paid(order, *, paid: bool = True) -> bool:
    """Mijoz to'lov qilganini bildirganda haydovchiga xabar yuboradi."""
    order.refresh_from_db()
    cache_key = f'client_paid_report_order_{order.id}:{paid}'
    if cache.get(cache_key):
        return False
    cache.set(cache_key, 1, REMINDER_COOLDOWN_SECONDS)

    amount = float(order.total_amount or 0)
    amount_suffix = f" ({amount:.0f} so'm)" if amount > 0 else ''
    if paid:
        title = "Mijoz to'lov qilganini bildirdi"
        message = (
            f"Buyurtma #{order.id}: mijoz to'lovni amalga oshirganini tasdiqladi{amount_suffix}. "
            f"Iltimos, qabul qilganingizni belgilang."
        )
    else:
        title = "Mijoz to'lov holatini yangiladi"
        message = f"Buyurtma #{order.id}: mijoz to'lov holatini yangiladi."

    create_notification(
        user=order.driver,
        notification_type='payment_received',
        title=title,
        message=message,
        order=order,
        send_push=True,
    )
    return True
