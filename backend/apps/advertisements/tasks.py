from __future__ import annotations

import logging
import time

try:
    from celery import shared_task
    task_decorator = shared_task
except ImportError:  # pragma: no cover
    def task_decorator(*args, **kwargs):
        def wrap(func):
            return func
        if args and callable(args[0]) and not kwargs:
            return args[0]
        return wrap

logger = logging.getLogger(__name__)

_WORKER_CACHE: dict[str, float | bool | None] = {'ok': None, 'at': 0.0}
_WORKER_CACHE_TTL_SEC = 20.0


def _celery_workers_online() -> bool:
    """Short-lived cache so offer fan-out does not ping Redis on every ad."""
    now = time.monotonic()
    cached_at = float(_WORKER_CACHE.get('at') or 0)
    cached_ok = _WORKER_CACHE.get('ok')
    if cached_ok is not None and (now - cached_at) < _WORKER_CACHE_TTL_SEC:
        return bool(cached_ok)
    try:
        from apps.common.infrastructure import _check_celery

        ok = bool((_check_celery() or {}).get('ok'))
    except Exception:
        ok = False
    _WORKER_CACHE['ok'] = ok
    _WORKER_CACHE['at'] = now
    return ok


@task_decorator(name='apps.advertisements.tasks.send_driver_load_offers')
def send_driver_load_offers_task(advertisement_id: int, limit: int = 12) -> int:
    from apps.advertisements.load_offers import notify_driver_load_offers
    from apps.advertisements.models import Advertisement

    advertisement = Advertisement.objects.filter(pk=advertisement_id, is_closed=False).first()
    if not advertisement:
        return 0
    return notify_driver_load_offers(advertisement, limit=limit)


def schedule_driver_load_offers(advertisement_id: int, *, limit: int = 12) -> None:
    """
    Prefer Celery when workers are online; otherwise send sync so offers are not stuck
    in the broker while no worker is running.
    """
    from django.conf import settings

    eager = bool(getattr(settings, 'CELERY_TASK_ALWAYS_EAGER', False))
    use_async = bool(getattr(settings, 'MATCHING_OFFERS_ASYNC', True))
    delay = getattr(send_driver_load_offers_task, 'delay', None)

    workers_online = False
    if use_async and not eager and callable(delay):
        workers_online = _celery_workers_online()

    if eager or not use_async or not workers_online or not callable(delay):
        sent = send_driver_load_offers_task(advertisement_id, limit)
        logger.info(
            'Driver load offers sent sync',
            extra={
                'event': 'driver_load_offers_sync',
                'advertisement_id': advertisement_id,
                'count': sent,
                'reason': (
                    'eager' if eager
                    else ('async_disabled' if not use_async else 'no_workers')
                ),
            },
        )
        return

    try:
        delay(advertisement_id, limit)
        logger.info(
            'Driver load offers queued',
            extra={'event': 'driver_load_offers_queued', 'advertisement_id': advertisement_id},
        )
    except Exception:
        logger.exception(
            'Driver load offers queue failed — running sync',
            extra={'event': 'driver_load_offers_sync_fallback', 'advertisement_id': advertisement_id},
        )
        send_driver_load_offers_task(advertisement_id, limit)
