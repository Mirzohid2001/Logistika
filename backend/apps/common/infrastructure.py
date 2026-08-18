from __future__ import annotations

import time
from typing import Any

from django.conf import settings
from django.db.models import Count
from django.utils import timezone


def _check_redis(url: str) -> dict[str, Any]:
    started = time.monotonic()
    try:
        import redis

        client = redis.from_url(url, socket_connect_timeout=1.5, socket_timeout=1.5)
        client.ping()
        latency_ms = int((time.monotonic() - started) * 1000)
        return {
            'ok': True,
            'latency_ms': latency_ms,
            'url': _mask_redis_url(url),
            'error': '',
        }
    except Exception as exc:
        return {
            'ok': False,
            'latency_ms': None,
            'url': _mask_redis_url(url),
            'error': str(exc),
        }


def _mask_redis_url(url: str) -> str:
    if '@' in url:
        prefix, host = url.split('@', 1)
        scheme = prefix.split('://', 1)[0] if '://' in prefix else 'redis'
        return f'{scheme}://***@{host}'
    return url


def _check_celery() -> dict[str, Any]:
    try:
        from config.celery import app

        inspector = app.control.inspect(timeout=1.5)
        ping = inspector.ping() or {}
        workers = sorted(ping.keys())
        return {
            'ok': bool(workers),
            'workers_online': len(workers),
            'worker_names': workers[:5],
            'error': '' if workers else 'Celery worker topilmadi',
        }
    except Exception as exc:
        return {
            'ok': False,
            'workers_online': 0,
            'worker_names': [],
            'error': str(exc),
        }


def get_push_queue_snapshot() -> dict[str, Any]:
    from apps.notifications.models import PushDeliveryQueue

    counts = {
        row['status']: row['count']
        for row in PushDeliveryQueue.objects.values('status').annotate(count=Count('id'))
    }
    pending = counts.get(PushDeliveryQueue.STATUS_PENDING, 0)
    failed = counts.get(PushDeliveryQueue.STATUS_FAILED, 0)
    dead = counts.get(PushDeliveryQueue.STATUS_DEAD, 0)
    sent = counts.get(PushDeliveryQueue.STATUS_SENT, 0)
    due_retry = PushDeliveryQueue.objects.filter(
        status__in=[PushDeliveryQueue.STATUS_PENDING, PushDeliveryQueue.STATUS_FAILED],
        next_retry_at__lte=timezone.now(),
    ).count()
    return {
        'pending': pending,
        'failed': failed,
        'dead': dead,
        'sent': sent,
        'due_retry': due_retry,
        'total': pending + failed + dead + sent,
        'admin_url': '/admin/notifications/pushdeliveryqueue/',
    }


def get_infrastructure_snapshot() -> dict[str, Any]:
    broker_url = getattr(settings, 'CELERY_BROKER_URL', 'redis://localhost:6379/0')
    cache_url = None
    try:
        cache_url = settings.CACHES['default']['LOCATION']
    except (AttributeError, KeyError, TypeError):
        pass

    redis_broker = _check_redis(broker_url)
    redis_cache = _check_redis(cache_url) if cache_url else {'ok': None, 'latency_ms': None, 'url': '', 'error': ''}
    celery = _check_celery()
    push_queue = get_push_queue_snapshot()

    overall_ok = redis_broker['ok'] and celery['ok'] and push_queue['dead'] == 0
    if redis_cache.get('ok') is False:
        overall_ok = False

    return {
        'overall_ok': overall_ok,
        'redis_broker': redis_broker,
        'redis_cache': redis_cache,
        'celery': celery,
        'push_queue': push_queue,
        'checked_at': timezone.now(),
    }
