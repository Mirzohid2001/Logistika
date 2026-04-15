from .models import Notification
from apps.users.models import User
from apps.orders.models import Order
from .push_service import push_service


def create_notification(
    user: User,
    notification_type: str,
    title: str,
    message: str,
    order: Order = None,
    send_push: bool = True
) -> Notification:
    """
    Create a notification for a user and optionally send push notification
    """
    notification = Notification.objects.create(
        user=user,
        order=order,
        notification_type=notification_type,
        title=title,
        message=message
    )
    
    # Push notification yuborish
    if send_push:
        data = {
            'notification_id': str(notification.id),
            'type': notification_type,
        }
        if order:
            data['order_id'] = str(order.id)
        
        push_service.send_notification(
            user=user,
            title=title,
            body=message,
            data=data
        )
    
    return notification
