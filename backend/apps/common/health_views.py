from django.conf import settings
from django.db import connection
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from apps.common.infrastructure import _check_redis


@require_GET
def health(request):
    return JsonResponse({'status': 'ok', 'service': 'logistika-api'})


@require_GET
def ready(request):
    checks = {'db': 'ok'}
    try:
        connection.ensure_connection()
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except Exception as exc:
        checks['db'] = str(exc)
        return JsonResponse({'status': 'not_ready', 'checks': checks}, status=503)

    try:
        from django.core.cache import cache

        cache.set('health_check', '1', 5)
        if cache.get('health_check') != '1':
            checks['cache'] = 'unavailable'
            return JsonResponse({'status': 'not_ready', 'checks': checks}, status=503)
        checks['cache'] = 'ok'
    except Exception as exc:
        checks['cache'] = str(exc)

    broker_url = getattr(settings, 'CELERY_BROKER_URL', '')
    if broker_url:
        broker = _check_redis(broker_url)
        checks['broker'] = 'ok' if broker.get('ok') else broker.get('error', 'unavailable')
        if not broker.get('ok'):
            return JsonResponse({'status': 'not_ready', 'checks': checks}, status=503)

    return JsonResponse({'status': 'ready', 'checks': checks})
