from __future__ import annotations

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from apps.users.models import User
from .models import Notification, PushDeliveryQueue
from .push_service import push_service


def enqueue_push(
    user: User,
    title: str,
    body: str,
    data: dict | None = None,
    notification: Notification | None = None,
) -> PushDeliveryQueue:
    max_attempts = int(getattr(settings, 'PUSH_MAX_RETRY_ATTEMPTS', 5))
    item = PushDeliveryQueue.objects.create(
        user=user,
        notification=notification,
        title=title,
        body=body,
        data=data or {},
        max_attempts=max_attempts,
        next_retry_at=timezone.now(),
    )
    return item


def deliver_push_queue_item(item: PushDeliveryQueue) -> bool:
    success, error = push_service.send_notification_detailed(
        user=item.user,
        title=item.title,
        body=item.body,
        data=item.data,
    )
    item.attempts += 1
    if success:
        item.status = PushDeliveryQueue.STATUS_SENT
        item.sent_at = timezone.now()
        item.last_error = ''
        item.save(update_fields=['status', 'attempts', 'sent_at', 'last_error', 'updated_at'])
        return True

    item.last_error = error or 'unknown_error'
    if item.attempts >= item.max_attempts:
        item.status = PushDeliveryQueue.STATUS_DEAD
        item.next_retry_at = None
    else:
        item.status = PushDeliveryQueue.STATUS_FAILED
        backoff = int(getattr(settings, 'PUSH_RETRY_BACKOFF_SECONDS', 60))
        item.next_retry_at = timezone.now() + timedelta(seconds=backoff * item.attempts)
    item.save(update_fields=['status', 'attempts', 'last_error', 'next_retry_at', 'updated_at'])
    return False


def process_pending_push_queue(limit: int = 50) -> dict:
    now = timezone.now()
    pending = PushDeliveryQueue.objects.filter(
        status__in=[PushDeliveryQueue.STATUS_PENDING, PushDeliveryQueue.STATUS_FAILED],
        next_retry_at__lte=now,
    ).order_by('next_retry_at')[:limit]

    sent = 0
    failed = 0
    for item in pending:
        if deliver_push_queue_item(item):
            sent += 1
        else:
            failed += 1
    return {'processed': sent + failed, 'sent': sent, 'failed': failed}
