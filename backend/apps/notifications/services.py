from .models import Notification
from apps.users.models import User
from apps.orders.models import Order
from apps.advertisements.models import Advertisement
from .preferences import user_allows_channel
from .push_queue import enqueue_push, deliver_push_queue_item


def create_notification(
    user: User,
    notification_type: str,
    title: str,
    message: str,
    order: Order = None,
    advertisement: Advertisement = None,
    send_push: bool = True,
    extra_push_data: dict = None,
) -> Notification | None:
    """
    Create in-app notification and optionally queue push delivery.
    Respects user notification preferences (opt-out).
    """
    allow_in_app = user_allows_channel(user, notification_type, channel='in_app')
    allow_push = send_push and user_allows_channel(user, notification_type, channel='push')

    notification = None
    if allow_in_app:
        notification = Notification.objects.create(
            user=user,
            order=order,
            advertisement=advertisement,
            notification_type=notification_type,
            title=title,
            message=message,
        )

    if allow_push:
        data = {
            'notification_id': str(notification.id) if notification else '',
            'type': notification_type,
            'title': title,
            'body': message,
        }
        if order:
            data['order_id'] = str(order.id)
        if advertisement:
            data['advertisement_id'] = str(advertisement.id)
        if extra_push_data:
            data.update({k: str(v) for k, v in extra_push_data.items() if v is not None})

        queue_item = enqueue_push(
            user=user,
            title=title,
            body=message,
            data=data,
            notification=notification,
        )
        deliver_push_queue_item(queue_item)

    return notification
