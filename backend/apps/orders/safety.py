from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from apps.notifications.services import create_notification
from apps.users.models import User

from .models import Order, OrderCustodyEvent, OrderSOSAlert


def log_custody_event(
    order: Order,
    actor: User,
    event_type: str,
    *,
    witness_name: str = '',
    lat=None,
    lng=None,
    note: str = '',
    metadata: dict | None = None,
) -> OrderCustodyEvent:
    return OrderCustodyEvent.objects.create(
        order=order,
        actor=actor,
        event_type=event_type,
        witness_name=witness_name,
        lat=lat,
        lng=lng,
        note=note,
        metadata=metadata or {},
    )


def _broadcast_sos_update(order: Order, alert: OrderSOSAlert) -> None:
    channel_layer = get_channel_layer()
    if channel_layer is None:
        return
    payload = {
        'type': 'driver_sos',
        'order_id': order.id,
        'driver_id': alert.driver_id,
        'lat': float(alert.lat) if alert.lat is not None else None,
        'lng': float(alert.lng) if alert.lng is not None else None,
        'message': alert.message,
        'status': alert.status,
        'updated_at': timezone.now().isoformat(),
    }
    async_to_sync(channel_layer.group_send)('dispatcher_tracking', payload)
    async_to_sync(channel_layer.group_send)(f'order_tracking_{order.id}', payload)


def trigger_driver_sos(order: Order, driver: User, lat: float, lng: float, message: str = '') -> OrderSOSAlert:
    active = (
        OrderSOSAlert.objects.filter(order=order, status=OrderSOSAlert.STATUS_ACTIVE)
        .order_by('-created_at')
        .first()
    )
    if active:
        active.lat = lat
        active.lng = lng
        if message:
            active.message = message
        active.save(update_fields=['lat', 'lng', 'message', 'updated_at'])
        alert = active
    else:
        alert = OrderSOSAlert.objects.create(
            order=order,
            driver=driver,
            lat=lat,
            lng=lng,
            message=message,
        )

    _broadcast_sos_update(order, alert)

    dispatchers = User.objects.filter(is_dispatcher=True, is_active=True)
    for dispatcher in dispatchers:
        create_notification(
            user=dispatcher,
            notification_type='driver_sos',
            title='Haydovchi SOS signali',
            message=message or f'Buyurtma #{order.id} — haydovchi yordam so\'rayapti.',
            order=order,
            extra_push_data={'lat': lat, 'lng': lng},
        )

    create_notification(
        user=order.client,
        notification_type='driver_sos',
        title='Haydovchi SOS signali',
        message=message or f'Buyurtma #{order.id} haydovchisi favqulodda yordam so\'rayapti.',
        order=order,
        extra_push_data={'lat': lat, 'lng': lng},
    )

    return alert


def acknowledge_sos_alert(alert: OrderSOSAlert, user: User) -> OrderSOSAlert:
    alert.status = OrderSOSAlert.STATUS_ACKNOWLEDGED
    alert.acknowledged_by = user
    alert.acknowledged_at = timezone.now()
    alert.save(update_fields=['status', 'acknowledged_by', 'acknowledged_at', 'updated_at'])
    _broadcast_sos_update(alert.order, alert)
    return alert


def resolve_sos_alert(alert: OrderSOSAlert) -> OrderSOSAlert:
    alert.status = OrderSOSAlert.STATUS_RESOLVED
    alert.resolved_at = timezone.now()
    alert.save(update_fields=['status', 'resolved_at', 'updated_at'])
    _broadcast_sos_update(alert.order, alert)
    return alert
