from django.db.models import Q

from apps.notifications.services import create_notification
from apps.users.models import User


def get_staff_moderators():
    return User.objects.filter(is_active=True).filter(
        Q(is_dispatcher=True)
        | Q(is_updater=True)
        | Q(is_operator=True)
        | Q(is_admin=True)
        | Q(is_staff=True)
        | Q(is_superuser=True)
    ).distinct()


def notify_staff_complaint_filed(complaint) -> int:
    sent = 0
    for moderator in get_staff_moderators():
        create_notification(
            user=moderator,
            notification_type='complaint_filed',
            title='Yangi shikoyat',
            message=(
                f"Buyurtma #{complaint.order_id} bo'yicha yangi shikoyat (#{complaint.id}). "
                f'Kategoriya: {complaint.get_category_display()}.'
            ),
            order=complaint.order,
            send_push=True,
        )
        sent += 1
    return sent
