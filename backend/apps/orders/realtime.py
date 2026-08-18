from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from django.utils import timezone

from apps.notifications.services import create_notification
from apps.users.models import User


def _tracking_groups(order_id: int) -> tuple[str, str]:
    return (f'order_tracking_{order_id}', 'dispatcher_tracking')


def _send_to_groups(groups, payload):
    channel_layer = get_channel_layer()
    if not channel_layer:
        return
    for group_name in groups:
        async_to_sync(channel_layer.group_send)(group_name, payload)


def fanout_order_tracking(order, payload: dict) -> None:
    """Send the same payload to order + dispatcher tracking groups."""
    _send_to_groups(_tracking_groups(order.id), payload)


def broadcast_order_status_changed(order, *, message=None):
    payload = {
        'type': 'order_status_changed',
        'order_id': order.id,
        'status_code': order.status.code,
        'status_name': getattr(order.status, 'name_ru', order.status.code),
        'message': message,
        'updated_at': timezone.now().isoformat(),
        'is_fully_paid': bool(order.is_fully_paid),
        'remaining_amount': float(order.remaining_amount or 0),
    }
    if order.status.code == 'completed':
        from apps.orders.distance_tracking import build_distance_summary

        payload['distance_summary'] = build_distance_summary(order)
        payload['tracked_distance_meters'] = order.tracked_distance_meters
        payload['loaded_distance_meters'] = order.loaded_distance_meters
        payload['tracked_distance_computed_at'] = (
            order.tracked_distance_computed_at.isoformat()
            if order.tracked_distance_computed_at
            else None
        )
    fanout_order_tracking(order, payload)


def broadcast_order_client_payment_confirmed(order):
    payload = {
        'type': 'order_client_payment_confirmed',
        'order_id': order.id,
        'client_payment_confirmed': order.client_payment_confirmed,
        'client_payment_confirmed_at': (
            order.client_payment_confirmed_at.isoformat()
            if order.client_payment_confirmed_at
            else None
        ),
        'is_fully_paid': bool(order.is_fully_paid),
        'remaining_amount': float(order.remaining_amount or 0),
        'payment_progress': float(order.payment_progress or 0),
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_order_pod_submitted(order):
    payload = {
        'type': 'order_pod_submitted',
        'order_id': order.id,
        'has_proof_of_delivery': True,
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def notify_client_pod_submitted(order) -> None:
    create_notification(
        user=order.client,
        notification_type='proof_of_delivery',
        title='Yuk yetkazildi',
        message=(
            f'Haydovchi buyurtma #{order.id} uchun POD yubordi. '
            'Yukni oldim ni bosing.'
        ),
        order=order,
        send_push=True,
    )


def publish_order_pod_submitted(order) -> None:
    broadcast_order_pod_submitted(order)
    notify_client_pod_submitted(order)


def broadcast_order_delivery_confirmed(order):
    payload = {
        'type': 'order_delivery_confirmed',
        'order_id': order.id,
        'client_delivery_confirmed': order.client_delivery_confirmed,
        'client_delivery_confirmed_at': (
            order.client_delivery_confirmed_at.isoformat()
            if order.client_delivery_confirmed_at
            else None
        ),
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_order_client_payment_reported(order):
    payload = {
        'type': 'order_client_payment_reported',
        'order_id': order.id,
        'client_paid_reported': order.client_paid_reported,
        'client_paid_reported_at': (
            order.client_paid_reported_at.isoformat()
            if order.client_paid_reported_at
            else None
        ),
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_order_payment_updated(order):
    payload = {
        'type': 'order_payment_updated',
        'order_id': order.id,
        'is_fully_paid': bool(order.is_fully_paid),
        'remaining_amount': float(order.remaining_amount or 0),
        'paid_amount': float(order.paid_amount or 0),
        'total_amount': float(order.total_amount or 0),
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_location_update(
    order,
    *,
    lat: float,
    lng: float,
    tracking_summary,
    estimated_eta_minutes,
    driver_last_seen_at: str,
    driver_app_state,
    driver_presence: dict,
    speed_mps: float | None = None,
    heading: float | None = None,
    raw_lat: float | None = None,
    raw_lng: float | None = None,
    snapped: bool = False,
    route_offset_meters: float | None = None,
    route_progress_m: float | None = None,
):
    payload = {
        'type': 'location_update',
        'order_id': order.id,
        'driver_id': order.driver_id,
        'lat': float(lat),
        'lng': float(lng),
        'speed_mps': float(speed_mps) if speed_mps is not None else None,
        'heading': float(heading) if heading is not None else None,
        'raw_lat': float(raw_lat) if raw_lat is not None else float(lat),
        'raw_lng': float(raw_lng) if raw_lng is not None else float(lng),
        'snapped': bool(snapped),
        'route_offset_meters': (
            float(route_offset_meters) if route_offset_meters is not None else None
        ),
        'route_progress_m': (
            float(route_progress_m) if route_progress_m is not None else None
        ),
        'updated_at': order.updated_at.isoformat(),
        'status_code': order.status.code,
        'tracking_summary': tracking_summary,
        'estimated_eta_minutes': estimated_eta_minutes,
        'driver_last_seen_at': driver_last_seen_at,
        'driver_app_state': driver_app_state,
        'driver_presence': driver_presence,
    }
    fanout_order_tracking(order, payload)


def broadcast_geofence_event(
    order,
    *,
    event: str,
    lat: float,
    lng: float,
    message: str | None = None,
    title: str | None = None,
    stop_id: int | None = None,
    sequence: int | None = None,
    stop_type: str | None = None,
    label: str | None = None,
    notification_type: str | None = None,
):
    payload = {
        'type': 'geofence_event',
        'order_id': order.id,
        'driver_id': order.driver_id,
        'event': event,
        'lat': float(lat),
        'lng': float(lng),
        'message': message,
        'title': title,
        'stop_id': stop_id,
        'sequence': sequence,
        'stop_type': stop_type,
        'label': label,
        'notification_type': notification_type,
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_route_stop_arrived(order, stop_event: dict, *, lat: float, lng: float):
    payload = {
        'type': 'route_stop_arrived',
        'order_id': order.id,
        'driver_id': order.driver_id,
        'stop_id': stop_event.get('stop_id'),
        'sequence': stop_event.get('sequence'),
        'stop_type': stop_event.get('stop_type'),
        'label': stop_event.get('label'),
        'lat': float(lat),
        'lng': float(lng),
        'detected_at': stop_event.get('detected_at'),
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def broadcast_route_stop_completed(order, stop, *, skipped: bool = False):
    payload = {
        'type': 'route_stop_completed',
        'order_id': order.id,
        'driver_id': order.driver_id,
        'stop_id': stop.id,
        'sequence': stop.sequence,
        'stop_type': stop.stop_type,
        'label': stop.label,
        'skipped': skipped,
        'status': stop.status,
        'completed_at': stop.completed_at.isoformat() if stop.completed_at else None,
        'updated_at': timezone.now().isoformat(),
    }
    fanout_order_tracking(order, payload)


def notify_route_stop_completed(order, stop, *, skipped: bool = False) -> None:
    from apps.orders.route_stops import skip_reason_display

    action = "o'tkazib yuborildi" if skipped else 'yakunlandi'
    label = stop.label or stop.stop_type
    message = f"Buyurtma #{order.id}: {label} (#{stop.sequence}) {action}"
    if skipped:
        reason = skip_reason_display(getattr(stop, 'notes', '') or '')
        if reason:
            message = f'{message}. Sabab: {reason}'
    title = "Marshrut nuqtasi o'tkazib yuborildi" if skipped else 'Marshrut nuqtasi yakunlandi'
    notification_type = 'route_stop_completed'

    if order.client_id:
        create_notification(
            user=order.client,
            notification_type=notification_type,
            title=title,
            message=message,
            order=order,
            extra_push_data={
                'stop_id': stop.id,
                'sequence': stop.sequence,
                'skipped': skipped,
            },
        )
    dispatchers = User.objects.filter(is_dispatcher=True, is_active=True)
    for dispatcher in dispatchers:
        create_notification(
            user=dispatcher,
            notification_type=notification_type,
            title=title,
            message=message,
            order=order,
            extra_push_data={
                'stop_id': stop.id,
                'sequence': stop.sequence,
                'skipped': skipped,
            },
        )


def publish_route_stop_completed(order, stop, *, skipped: bool = False) -> None:
    broadcast_route_stop_completed(order, stop, skipped=skipped)
    notify_route_stop_completed(order, stop, skipped=skipped)
