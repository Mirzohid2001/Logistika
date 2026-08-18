"""Shared order status transitions used by views and route-stop actions."""

from __future__ import annotations

import logging

from apps.orders.models import Order, OrderStatus

logger = logging.getLogger(__name__)


def transition_order_to_in_transit(order: Order, *, notify: bool = True) -> Order:
    """Cargo loaded — driver departs toward delivery (in_progress → in_transit)."""
    order.refresh_from_db()
    if order.status.code == 'in_transit':
        return order
    if order.status.code != 'in_progress':
        raise ValueError(f'Order cannot depart from status: {order.status.code}')

    in_transit_status = OrderStatus.objects.filter(code='in_transit').first()
    if not in_transit_status:
        in_transit_status = OrderStatus.objects.create(
            code='in_transit',
            name_ru='В пути',
            name_en='In Transit',
            name_uz="Yo'lda",
        )
    order.status = in_transit_status
    update_fields = ['status', 'updated_at']
    if order.in_transit_at is None:
        from django.utils import timezone

        order.in_transit_at = timezone.now()
        update_fields.append('in_transit_at')
    order.save(update_fields=update_fields)

    if notify:
        from apps.orders.views import _invalidate_order_list_cache
        from apps.common.services import send_notification_sms
        from apps.notifications.services import create_notification
        from apps.orders.realtime import broadcast_order_status_changed

        _invalidate_order_list_cache(order)
        driver_name = f'{order.driver.first_name} {order.driver.last_name}'
        message = (
            f"Haydovchi {driver_name} yuk bilan yo'lga chiqdi. "
            f"Buyurtma #{order.id} manzilga yo'nalmoqda."
        )
        try:
            send_notification_sms(order.client.phone, message)
            create_notification(
                user=order.client,
                notification_type='order_in_transit',
                title="Yuk yo'lda",
                message=message,
                order=order,
            )
        except Exception:
            logger.exception(
                'Failed to notify client about in-transit status',
                extra={'event': 'order_in_transit_notify_failed', 'order_id': order.id},
            )
        broadcast_order_status_changed(order, message=message)

    return order


def prepare_and_depart(order: Order, user) -> Order:
    """Require pickup arrival (when geocoded), then mark cargo loaded and go in_transit."""
    from apps.orders.models import OrderRouteStop
    from apps.orders.route_stops import (
        complete_route_stop,
        ensure_default_route_stops,
        first_pickup_stop,
        stop_has_coords,
    )

    ensure_default_route_stops(order)
    pickup = first_pickup_stop(order)
    if pickup and stop_has_coords(pickup):
        if pickup.status == OrderRouteStop.STATUS_PENDING:
            raise ValueError('Avval yuklash manziliga yetib boring.')
        if pickup.status == OrderRouteStop.STATUS_ARRIVED:
            complete_route_stop(order, pickup.id, user, skip=False)
            order.refresh_from_db()
            if order.status.code == 'in_transit':
                return order
    return transition_order_to_in_transit(order)
