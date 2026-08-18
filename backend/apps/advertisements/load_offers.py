from __future__ import annotations

import logging

from django.db.models import Q

from apps.advertisements.driver_matching import get_driver_matches
from apps.advertisements.models import Advertisement
from apps.notifications.models import Notification
from apps.notifications.services import create_notification
from apps.users.models import User
from apps.vehicles.models import Vehicle

logger = logging.getLogger(__name__)


def notify_driver_load_offers(advertisement: Advertisement, *, limit: int = 12) -> int:
    if advertisement.is_closed:
        return 0

    vehicles = Vehicle.objects.filter(user__is_driver=True, user__is_active=True)
    if advertisement.weight:
        vehicles = vehicles.filter(load_capacity__gte=advertisement.weight)
    body = (advertisement.required_body_type or '').strip()
    if body:
        vehicles = vehicles.filter(body_type=body)
    if advertisement.requires_adr or 'dangerous' in (advertisement.special_requirements or []):
        vehicles = vehicles.filter(has_adr=True)
    if advertisement.requires_reefer or 'refrigerated' in (advertisement.special_requirements or []):
        vehicles = vehicles.filter(Q(is_reefer=True) | Q(body_type='reefer'))
    if advertisement.is_heavy:
        vehicles = vehicles.filter(is_heavy_haul=True)

    from apps.users.document_expiry import expired_driver_user_ids

    expired_ids = list(expired_driver_user_ids())
    if expired_ids:
        vehicles = vehicles.exclude(user_id__in=expired_ids)
    driver_ids = list(vehicles.values_list('user_id', flat=True).distinct()[:80])
    # Mos mashinasi yo'q haydovchilarga spam qilmaymiz.
    if not driver_ids:
        logger.info(
            'Driver load offers skipped — no capable vehicles',
            extra={'event': 'driver_load_offers_skip', 'advertisement_id': advertisement.id},
        )
        return 0

    already = set(
        Notification.objects.filter(
            advertisement=advertisement,
            notification_type='driver_load_offer',
        ).values_list('user_id', flat=True)
    )
    sent = 0
    route = f"{advertisement.departure_city_id}->{advertisement.destination_city_id}"
    title = advertisement.title_uz or advertisement.title_ru or 'Yangi yuk'
    for driver in User.objects.filter(id__in=driver_ids, is_driver=True, is_active=True).exclude(id=advertisement.client_id):
        if driver.id in already:
            continue
        matches = get_driver_matches(driver, limit=12)
        hit = next((item for item in matches['matches'] if item['advertisement_id'] == advertisement.id), None)
        if not hit or hit['match_score'] < 35:
            continue
        create_notification(
            user=driver,
            notification_type='driver_load_offer',
            title='Sizga mos yuk',
            message=f"{title} · {hit['departure_city']} → {hit['destination_city']} · {hit['match_score']}%",
            advertisement=advertisement,
            extra_push_data={'match_score': hit['match_score'], 'route': route},
        )
        sent += 1
        if sent >= limit:
            break
    logger.info(
        'Driver load offers sent',
        extra={'event': 'driver_load_offers', 'advertisement_id': advertisement.id, 'count': sent},
    )
    return sent
