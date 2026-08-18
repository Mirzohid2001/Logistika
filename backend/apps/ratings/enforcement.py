from datetime import timedelta

from django.utils import timezone

from apps.notifications.services import create_notification
from apps.users.models import User


def apply_complaint_resolution_action(user: User, *, action: str, complaint) -> None:
    if action in (None, '', 'none', 'warn'):
        if action == 'warn':
            create_notification(
                user=user,
                notification_type='system',
                title='Ogohlantirish',
                message=(
                    f"Buyurtma #{complaint.order_id} bo'yicha shikoyat ko'rib chiqildi. "
                    'Qoidalar buzilishi takrorlansa, hisob cheklanishi mumkin.'
                ),
                order=complaint.order,
            )
        return

    if action == 'suspend_7':
        user.suspended_until = timezone.now() + timedelta(days=7)
        user.save(update_fields=['suspended_until', 'updated_at'])
        message = 'Hisobingiz 7 kunga to\'xtatildi (shikoyat natijasi).'
    elif action == 'suspend_30':
        user.suspended_until = timezone.now() + timedelta(days=30)
        user.save(update_fields=['suspended_until', 'updated_at'])
        message = 'Hisobingiz 30 kunga to\'xtatildi (shikoyat natijasi).'
    elif action == 'block':
        user.is_blocked = True
        user.save(update_fields=['is_blocked', 'updated_at'])
        message = 'Hisobingiz bloklandi (shikoyat natijasi).'
    else:
        return

    create_notification(
        user=user,
        notification_type='system',
        title='Hisob cheklovi',
        message=message,
        order=complaint.order,
    )
