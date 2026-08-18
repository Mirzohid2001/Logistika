from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from decimal import Decimal
from typing import Any

from django.db.models import Q
from django.utils import timezone

from apps.advertisements.load_fit import check_driver_load_fit, vehicle_meets_requirements
from apps.advertisements.models import Advertisement, DriverAvailability, DriverLane
from apps.orders.models import Order
from apps.vehicles.models import Vehicle

ACTIVE_TRIP_CODES = ('in_progress', 'in_transit', 'approved_by_client')
ISO_WEEKDAY = {0: 1, 1: 2, 2: 3, 3: 4, 4: 5, 5: 6, 6: 7}
# Priority candidates (lanes / nearby) + small recent fallback for discovery.
MATCH_PRIORITY_LIMIT = 320
MATCH_RECENT_FALLBACK = 80


def _city_name(city) -> str:
    if not city:
        return ''
    return city.name_uz or city.name_ru or city.name_en or ''


def _ad_requirements(ad: Advertisement) -> dict[str, Any]:
    reqs = list(ad.special_requirements or [])
    return {
        'body': (getattr(ad, 'required_body_type', '') or '').strip(),
        'adr': bool(getattr(ad, 'requires_adr', False) or 'dangerous' in reqs),
        'reefer': bool(getattr(ad, 'requires_reefer', False) or 'refrigerated' in reqs),
        'heavy': bool(getattr(ad, 'is_heavy', False)),
    }


def _pickup_moment(ad: Advertisement):
    moment = ad.pickup_window_start or ad.created_at
    if not moment:
        return None
    if timezone.is_aware(moment):
        return timezone.localtime(moment)
    return moment


def _pickup_weekday(ad: Advertisement) -> int | None:
    moment = _pickup_moment(ad)
    if not moment:
        return None
    return ISO_WEEKDAY.get(moment.weekday())


def _pickup_hour(ad: Advertisement) -> int | None:
    moment = _pickup_moment(ad)
    if not moment:
        return None
    return int(moment.hour)


def _hour_in_window(hour: int | None, start: int | None, end: int | None) -> bool:
    """Null bounds mean open side. Overnight windows supported (e.g. 22–6)."""
    if start is None and end is None:
        return True
    if hour is None:
        # Ad has no pickup time — do not hard-reject the lane.
        return True
    lo = 0 if start is None else int(start)
    hi = 23 if end is None else int(end)
    if lo <= hi:
        return lo <= hour <= hi
    return hour >= lo or hour <= hi


def _parse_hour(raw) -> int | None:
    if raw is None or raw == '':
        return None
    try:
        value = int(raw)
    except (TypeError, ValueError):
        return None
    if 0 <= value <= 23:
        return value
    return None


@dataclass
class DriverMatchContext:
    driver: Any
    availability: dict[str, Any]
    lanes: list[DriverLane]
    vehicle: Vehicle | None
    anchor_city_id: int | None
    anchor_reason: str | None
    backhaul_origins: set[int]
    # (dep, dest, weekdays, include_backhaul, time_from, time_to)
    lane_pairs: list[tuple[int, int, list[int], bool, int | None, int | None]]


def resolve_availability(driver) -> dict[str, Any]:
    row = DriverAvailability.objects.filter(user=driver).select_related('current_city').first()
    now = timezone.now()
    active_order = (
        Order.objects.filter(driver=driver, status__code__in=ACTIVE_TRIP_CODES)
        .select_related('advertisement', 'status')
        .order_by('-updated_at')
        .first()
    )
    last_completed = (
        Order.objects.filter(driver=driver, status__code='completed')
        .select_related('advertisement')
        .order_by('-completed_at', '-updated_at')
        .first()
    )

    status = row.status if row else DriverAvailability.STATUS_AVAILABLE
    available_from = row.available_from if row else None
    current_city_id = row.current_city_id if row else None
    current_city_obj = row.current_city if row else None
    note = row.note if row else ''
    on_trip = bool(active_order)
    if on_trip:
        status = DriverAvailability.STATUS_BUSY
        if not available_from or available_from < now:
            available_from = now + timedelta(hours=2)
        dest_city = active_order.advertisement.destination_city
        current_city_id = current_city_id or getattr(dest_city, 'id', None)
        if not current_city_obj and dest_city:
            current_city_obj = dest_city
    elif status == DriverAvailability.STATUS_SCHEDULED and available_from and available_from <= now:
        status = DriverAvailability.STATUS_AVAILABLE
        available_from = None
    elif status == DriverAvailability.STATUS_BUSY and not on_trip:
        pass

    effective = 'available'
    if status == DriverAvailability.STATUS_BUSY and on_trip:
        effective = 'on_trip'
    elif status == DriverAvailability.STATUS_BUSY:
        effective = 'busy'
    elif status == DriverAvailability.STATUS_SCHEDULED and available_from and available_from > now:
        effective = 'scheduled'

    return {
        'status': status,
        'effective': effective,
        'available_from': available_from.isoformat() if available_from else None,
        'available_from_dt': available_from,
        'current_city_id': current_city_id,
        'current_city': _city_name(current_city_obj),
        'note': note,
        'on_trip': on_trip,
        'active_order_id': active_order.id if active_order else None,
        'anchor_city_id': (
            active_order.advertisement.destination_city_id
            if active_order
            else (last_completed.advertisement.destination_city_id if last_completed else current_city_id)
        ),
        'anchor_reason': (
            'active_destination' if active_order
            else ('last_destination' if last_completed else ('current_city' if current_city_id else None))
        ),
    }


def build_driver_context(driver) -> DriverMatchContext:
    availability = resolve_availability(driver)
    lanes = list(
        DriverLane.objects.filter(user=driver, is_active=True).select_related(
            'departure_city', 'destination_city',
        )
    )
    vehicle = (
        Vehicle.objects.filter(user=driver, verification_status='approved').order_by('-id').first()
        or Vehicle.objects.filter(user=driver).order_by('-id').first()
    )
    backhaul_origins: set[int] = set()
    if availability['anchor_city_id']:
        backhaul_origins.add(availability['anchor_city_id'])
    if availability['current_city_id']:
        backhaul_origins.add(availability['current_city_id'])
    lane_pairs = []
    for lane in lanes:
        days = [int(day) for day in (lane.weekdays or []) if str(day).isdigit()]
        time_from = lane.time_from_hour if lane.time_from_hour is not None else None
        time_to = lane.time_to_hour if lane.time_to_hour is not None else None
        lane_pairs.append((
            lane.departure_city_id,
            lane.destination_city_id,
            days,
            lane.include_backhaul,
            time_from,
            time_to,
        ))
        if lane.include_backhaul:
            backhaul_origins.add(lane.destination_city_id)
    return DriverMatchContext(
        driver=driver,
        availability=availability,
        lanes=lanes,
        vehicle=vehicle,
        anchor_city_id=availability['anchor_city_id'],
        anchor_reason=availability['anchor_reason'],
        backhaul_origins=backhaul_origins,
        lane_pairs=lane_pairs,
    )


def _score_advertisement(ad: Advertisement, context: DriverMatchContext) -> dict[str, Any] | None:
    reqs = _ad_requirements(ad)
    pickup_start = ad.pickup_window_start
    pickup_end = ad.pickup_window_end
    available_from = context.availability['available_from_dt']
    effective = context.availability['effective']
    is_backhaul = bool(ad.departure_city_id and ad.departure_city_id in context.backhaul_origins)
    weekday = _pickup_weekday(ad)
    pickup_hour = _pickup_hour(ad)

    if effective == 'busy':
        return None
    # Safarda faqat qaytish yuki — oddiy e'lonlar chiqmasin.
    if effective == 'on_trip' and not is_backhaul:
        return None
    if effective == 'scheduled' and available_from:
        if pickup_end and pickup_end < available_from:
            return None
        if not pickup_end and pickup_start and pickup_start < available_from:
            return None

    fit = check_driver_load_fit(
        context.driver,
        Decimal(str(ad.weight)),
        Decimal(str(ad.volume_m3)) if ad.volume_m3 is not None else None,
        advertisement=ad,
        vehicle=context.vehicle,
    )
    if not fit['fits']:
        # Mashina yo'q bo'lsa ham qaytish yukini ko'rsatamiz (discovery).
        if not (is_backhaul and fit['reason'] == 'no_vehicle'):
            return None

    if context.vehicle and not vehicle_meets_requirements(context.vehicle, reqs)[0]:
        return None

    score = 20
    reasons: list[str] = []
    if is_backhaul:
        score += 40
        reasons.append('backhaul')
    lane_hit = False
    for dep_id, dest_id, days, include_backhaul, time_from, time_to in context.lane_pairs:
        forward = ad.departure_city_id == dep_id and ad.destination_city_id == dest_id
        reverse = (
            include_backhaul
            and ad.departure_city_id == dest_id
            and ad.destination_city_id == dep_id
        )
        if not (forward or reverse):
            continue
        if not _hour_in_window(pickup_hour, time_from, time_to):
            continue
        lane_hit = True
        if forward:
            score += 25
            reasons.append('lane')
            if days and weekday in days:
                score += 12
                reasons.append('weekday')
        else:
            score += 30
            reasons.append('lane_backhaul')
            if days and weekday in days:
                score += 8
                reasons.append('weekday')
        if time_from is not None or time_to is not None:
            score += 10
            reasons.append('time_slot')
        break
    if reqs['body'] and context.vehicle and context.vehicle.body_type == reqs['body']:
        score += 10
        reasons.append('body')
    if reqs['adr'] and context.vehicle and context.vehicle.has_adr:
        score += 8
        reasons.append('adr')
    if reqs['reefer'] and context.vehicle and (context.vehicle.is_reefer or context.vehicle.body_type == 'reefer'):
        score += 8
        reasons.append('reefer')
    if reqs['heavy'] and context.vehicle and context.vehicle.is_heavy_haul:
        score += 6
        reasons.append('heavy')
    current_city_id = context.availability.get('current_city_id')
    if current_city_id and ad.departure_city_id == current_city_id:
        score += 22
        reasons.append('nearby')
    if ad.proposed_cost:
        score += 5
    if fit['fits']:
        score += 10
        reasons.append('fits')
    if not reasons and not lane_hit and not is_backhaul:
        reasons.append('open_load')
    return {
        'advertisement_id': ad.id,
        'title': ad.title_uz or ad.title_ru,
        'departure_city': _city_name(ad.departure_city),
        'destination_city': _city_name(ad.destination_city),
        'departure_city_id': ad.departure_city_id,
        'destination_city_id': ad.destination_city_id,
        'weight': float(ad.weight),
        'proposed_cost': float(ad.proposed_cost) if ad.proposed_cost else None,
        'cargo_category': ad.cargo_category,
        'required_body_type': reqs['body'],
        'requires_adr': reqs['adr'],
        'requires_reefer': reqs['reefer'],
        'is_heavy': reqs['heavy'],
        'match_score': min(score, 100),
        'match_reason': reasons[0] if reasons else 'open_load',
        'reasons': reasons,
        'is_backhaul': is_backhaul,
    }


def _public_availability(availability: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in availability.items() if k != 'available_from_dt'}


def _base_open_ads(driver):
    return Advertisement.objects.filter(is_closed=False).exclude(client_id=driver.id)


def _weight_filtered(qs, vehicle: Vehicle | None):
    if vehicle and vehicle.load_capacity is not None:
        return qs.filter(weight__lte=vehicle.load_capacity)
    return qs


def _candidate_advertisements(driver, context: DriverMatchContext, *, backhaul_only: bool = False):
    """DB-level candidate set: lane pairs + nearby/backhaul cities, then recent fallback."""
    base = _weight_filtered(_base_open_ads(driver), context.vehicle)

    if backhaul_only or context.availability['effective'] == 'on_trip':
        if not context.backhaul_origins:
            return Advertisement.objects.none()
        return (
            base.filter(departure_city_id__in=list(context.backhaul_origins))
            .select_related('departure_city', 'destination_city', 'client')
            .order_by('-created_at')[: MATCH_PRIORITY_LIMIT + MATCH_RECENT_FALLBACK]
        )

    lane_q = Q()
    city_ids: set[int] = set(context.backhaul_origins)
    current_city_id = context.availability.get('current_city_id')
    if current_city_id:
        city_ids.add(current_city_id)

    for dep_id, dest_id, _days, include_backhaul, _tf, _tt in context.lane_pairs:
        lane_q |= Q(departure_city_id=dep_id, destination_city_id=dest_id)
        city_ids.add(dep_id)
        city_ids.add(dest_id)
        if include_backhaul:
            lane_q |= Q(departure_city_id=dest_id, destination_city_id=dep_id)

    priority_q = Q()
    if lane_q:
        priority_q |= lane_q
    if city_ids:
        priority_q |= Q(departure_city_id__in=list(city_ids))

    ids: list[int] = []
    if priority_q:
        ids.extend(
            base.filter(priority_q)
            .order_by('-created_at')
            .values_list('id', flat=True)[:MATCH_PRIORITY_LIMIT]
        )

    remaining = (MATCH_PRIORITY_LIMIT + MATCH_RECENT_FALLBACK) - len(ids)
    if remaining > 0:
        recent_cap = min(remaining, MATCH_RECENT_FALLBACK)
        recent = (
            base.exclude(id__in=ids)
            .order_by('-created_at')
            .values_list('id', flat=True)[:recent_cap]
        )
        ids.extend(list(recent))

    if not ids:
        return (
            base.select_related('departure_city', 'destination_city', 'client')
            .order_by('-created_at')[:MATCH_RECENT_FALLBACK]
        )

    # Preserve created_at order while keeping the candidate id set.
    return (
        Advertisement.objects.filter(id__in=ids)
        .select_related('departure_city', 'destination_city', 'client')
        .order_by('-created_at')
    )


def get_driver_matches(driver, *, limit: int = 20, backhaul_only: bool = False) -> dict[str, Any]:
    context = build_driver_context(driver)

    if backhaul_only or context.availability['effective'] == 'on_trip':
        if not context.backhaul_origins:
            return {
                'available': False,
                'anchor_city_id': context.anchor_city_id,
                'anchor_reason': context.anchor_reason,
                'availability': _public_availability(context.availability),
                'lanes': [_serialize_lane(lane) for lane in context.lanes],
                'vehicle': _serialize_vehicle(context.vehicle),
                'matches': [],
                'message': "Qaytish yuki uchun yo'nalish yoki faol/yakunlangan buyurtma kerak.",
            }

    queryset = _candidate_advertisements(driver, context, backhaul_only=backhaul_only)

    matches = []
    for ad in queryset:
        scored = _score_advertisement(ad, context)
        if scored:
            matches.append(scored)
    matches.sort(key=lambda item: (item['match_score'], 1 if item['is_backhaul'] else 0), reverse=True)
    return {
        'available': True,
        'anchor_city_id': context.anchor_city_id,
        'anchor_reason': context.anchor_reason,
        'availability': _public_availability(context.availability),
        'lanes': [_serialize_lane(lane) for lane in context.lanes],
        'vehicle': _serialize_vehicle(context.vehicle),
        'matches': matches[:limit],
    }


def _serialize_lane(lane: DriverLane) -> dict[str, Any]:
    return {
        'id': lane.id,
        'departure_city_id': lane.departure_city_id,
        'destination_city_id': lane.destination_city_id,
        'departure_city': _city_name(lane.departure_city),
        'destination_city': _city_name(lane.destination_city),
        'weekdays': lane.weekdays or [],
        'time_from_hour': lane.time_from_hour,
        'time_to_hour': lane.time_to_hour,
        'include_backhaul': lane.include_backhaul,
        'is_active': lane.is_active,
    }


def _serialize_vehicle(vehicle: Vehicle | None) -> dict[str, Any] | None:
    if not vehicle:
        return None
    return {
        'id': vehicle.id,
        'make': vehicle.make,
        'model': vehicle.model,
        'number': vehicle.number,
        'body_type': vehicle.body_type,
        'has_adr': vehicle.has_adr,
        'is_reefer': vehicle.is_reefer or vehicle.body_type == 'reefer',
        'is_heavy_haul': vehicle.is_heavy_haul,
        'load_capacity': float(vehicle.load_capacity),
    }
