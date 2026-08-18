from datetime import timedelta

from django.utils import timezone

from apps.notifications.services import create_notification
from apps.users.models import DriverDocument

DOCUMENT_EXPIRY_WARNING_DAYS = 30
DOCUMENT_EXPIRED_CODE = 'document_expired'


def get_expired_active_documents(user):
    """Active DriverDocument rows whose expiry date is before today.

    Drivers with no DriverDocument rows are not treated as expired — many
    still only have document_photos on the user profile.
    """
    if user is None or not getattr(user, 'is_driver', False):
        return DriverDocument.objects.none()
    today = timezone.now().date()
    return DriverDocument.objects.filter(
        user=user,
        is_active=True,
        expires_at__lt=today,
    ).order_by('expires_at')


def driver_has_expired_documents(user) -> bool:
    return get_expired_active_documents(user).exists()


def expired_driver_user_ids():
    today = timezone.now().date()
    return DriverDocument.objects.filter(
        is_active=True,
        expires_at__lt=today,
        user__is_driver=True,
    ).values_list('user_id', flat=True).distinct()


def expired_documents_error_payload(user) -> dict | None:
    docs = list(get_expired_active_documents(user))
    if not docs:
        return None
    names = ', '.join(doc.get_document_type_display() for doc in docs)
    return {
        'error': (
            f"Hujjat muddati tugagan: {names}. "
            "Yangi taklif berish va buyurtma olish uchun hujjatlarni yangilang."
        ),
        'code': DOCUMENT_EXPIRED_CODE,
        'expired_documents': [
            {
                'id': doc.id,
                'document_type': doc.document_type,
                'document_type_name': doc.get_document_type_display(),
                'expires_at': doc.expires_at.isoformat(),
            }
            for doc in docs
        ],
    }


def document_expiry_forbidden_response(user):
    """403 Response if the driver has expired dated documents, else None."""
    payload = expired_documents_error_payload(user)
    if not payload:
        return None
    from rest_framework import status
    from rest_framework.response import Response

    return Response(payload, status=status.HTTP_403_FORBIDDEN)


def process_driver_document_expiry_reminders() -> dict:
    """Send at most one document_expiry notification per document per day."""
    today = timezone.now().date()
    warning_date = today + timedelta(days=DOCUMENT_EXPIRY_WARNING_DAYS)
    documents = DriverDocument.objects.select_related('user', 'vehicle').filter(
        is_active=True,
        user__is_driver=True,
        user__is_active=True,
        expires_at__lte=warning_date,
    ).order_by('expires_at')[:500]

    alerts = []
    expired_count = 0
    expiring_soon_count = 0
    notified_count = 0
    now = timezone.now()

    for doc in documents:
        days_left = (doc.expires_at - today).days
        severity = 'high' if days_left < 0 else ('medium' if days_left <= 7 else 'low')
        if days_left < 0:
            expired_count += 1
        else:
            expiring_soon_count += 1

        if doc.reminder_sent_at is None or doc.reminder_sent_at.date() != today:
            title = (
                'Hujjat muddati tugagan'
                if days_left < 0
                else 'Hujjat muddati tugayapti'
            )
            create_notification(
                user=doc.user,
                notification_type='document_expiry',
                title=title,
                message=(
                    f"{doc.get_document_type_display()} hujjati muddati "
                    f"{doc.expires_at.strftime('%Y-%m-%d')} da tugaydi."
                ),
                send_push=True,
            )
            doc.reminder_sent_at = now
            doc.save(update_fields=['reminder_sent_at', 'updated_at'])
            notified_count += 1

        alerts.append({
            'document_id': doc.id,
            'driver_id': doc.user_id,
            'driver_phone': doc.user.phone,
            'document_type': doc.document_type,
            'document_type_name': doc.get_document_type_display(),
            'expires_at': doc.expires_at.isoformat(),
            'days_left': days_left,
            'severity': severity,
            'vehicle_number': doc.vehicle.number if doc.vehicle else None,
        })

    return {
        'items': alerts,
        'count': len(alerts),
        'expired_count': expired_count,
        'expiring_soon_count': expiring_soon_count,
        'notified_count': notified_count,
    }
