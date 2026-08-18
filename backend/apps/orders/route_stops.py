from __future__ import annotations

import re

from django.utils import timezone

from .models import Order, OrderRouteStop

_COORD_PATTERN = re.compile(r'(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)')


def parse_coords_from_address(address: str) -> tuple[float, float] | None:
    if not address:
        return None
    match = _COORD_PATTERN.search(address.strip())
    if not match:
        return None
    lat = float(match.group(1))
    lng = float(match.group(2))
    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        return None
    return lat, lng


def ensure_default_route_stops(order: Order) -> list[OrderRouteStop]:
    """Create route stops from advertisement when order is created."""
    if order.route_stops.exists():
        return list(order.route_stops.order_by('sequence'))

    advertisement = order.advertisement
    planned_stops = advertisement.route_stops if isinstance(advertisement.route_stops, list) else []
    if len(planned_stops) >= 2:
        stops = []
        for item in sorted(planned_stops, key=lambda row: int(row.get('sequence') or 0)):
            lat = item.get('lat')
            lng = item.get('lng')
            if lat is None or lng is None:
                coords = parse_coords_from_address(str(item.get('address') or ''))
                if coords:
                    lat, lng = coords
            stops.append(
                OrderRouteStop(
                    order=order,
                    sequence=int(item.get('sequence') or len(stops) + 1),
                    stop_type=item.get('stop_type') or OrderRouteStop.STOP_DELIVERY,
                    label=str(item.get('label') or f'Stop {len(stops) + 1}'),
                    address=str(item.get('address') or ''),
                    lat=lat,
                    lng=lng,
                )
            )
        if stops:
            stops[0].stop_type = OrderRouteStop.STOP_PICKUP
            stops[-1].stop_type = OrderRouteStop.STOP_DELIVERY
            created = OrderRouteStop.objects.bulk_create(stops)
            sync_planned_route_from_stops(order)
            return created

    pickup_coords = parse_coords_from_address(advertisement.departure_address or '')
    delivery_coords = parse_coords_from_address(advertisement.destination_address or '')
    stops = [
        OrderRouteStop(
            order=order,
            sequence=1,
            stop_type=OrderRouteStop.STOP_PICKUP,
            label='Pickup',
            address=advertisement.departure_address or '',
            lat=pickup_coords[0] if pickup_coords else None,
            lng=pickup_coords[1] if pickup_coords else None,
        ),
        OrderRouteStop(
            order=order,
            sequence=2,
            stop_type=OrderRouteStop.STOP_DELIVERY,
            label='Delivery',
            address=advertisement.destination_address or '',
            lat=delivery_coords[0] if delivery_coords else None,
            lng=delivery_coords[1] if delivery_coords else None,
        ),
    ]
    created = OrderRouteStop.objects.bulk_create(stops)
    sync_planned_route_from_stops(order)
    return created


def sync_planned_route_from_stops(order: Order) -> None:
    points = []
    for stop in order.route_stops.order_by('sequence'):
        if stop.lat is None or stop.lng is None:
            continue
        points.append(
            {
                'id': stop.id,
                'sequence': stop.sequence,
                'type': stop.stop_type,
                'label': stop.label,
                'address': stop.address,
                'lat': float(stop.lat),
                'lng': float(stop.lng),
                'status': stop.status,
            }
        )
    order.planned_route_points = points
    order.save(update_fields=['planned_route_points', 'updated_at'])
    from apps.orders.distance_tracking import ensure_estimated_route_distance

    ensure_estimated_route_distance(order)


def apply_optimized_stop_order(order: Order, ordered_stop_ids: list[int]) -> None:
    for index, stop_id in enumerate(ordered_stop_ids, start=1):
        OrderRouteStop.objects.filter(order=order, pk=stop_id).update(sequence=index)
    sync_planned_route_from_stops(order)


def order_has_geocoded_route_stops(order: Order) -> bool:
    return order.route_stops.filter(lat__isnull=False, lng__isnull=False).exists()


def get_active_route_stop(order: Order) -> OrderRouteStop | None:
    """Return the next pending stop for geofence checks.

    Arrived stops stay active for manual completion but no longer block
    geofence detection for subsequent stops.
    """
    return (
        order.route_stops.filter(status=OrderRouteStop.STATUS_PENDING)
        .order_by('sequence')
        .first()
    )


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import radians, cos, sin, asin, sqrt

    r = 6371000
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return r * 2 * asin(sqrt(a))


def process_route_stop_geofence(order: Order, lat: float, lng: float, now=None) -> list[dict]:
    """Check geofence for the current active route stop. Returns event payloads."""
    now = now or timezone.now()
    events: list[dict] = []
    active = get_active_route_stop(order)
    if not active or active.lat is None or active.lng is None:
        return events

    distance = haversine_meters(lat, lng, float(active.lat), float(active.lng))
    entered = distance <= float(active.geofence_radius_meters)

    if entered and active.status == OrderRouteStop.STATUS_PENDING:
        active.status = OrderRouteStop.STATUS_ARRIVED
        active.arrived_at = now
        active.save(update_fields=['status', 'arrived_at', 'updated_at'])
        events.append(
            {
                'type': 'route_stop_arrived',
                'order_id': order.id,
                'stop_id': active.id,
                'stop_type': active.stop_type,
                'sequence': active.sequence,
                'label': active.label,
                'detected_at': now.isoformat(),
            }
        )
    return events


_TERMINAL_STOP_STATUSES = frozenset({
    OrderRouteStop.STATUS_COMPLETED,
    OrderRouteStop.STATUS_SKIPPED,
})


def order_has_incomplete_route_stops(order: Order) -> bool:
    return order.route_stops.exclude(status__in=_TERMINAL_STOP_STATUSES).exists()


def stop_has_coords(stop: OrderRouteStop) -> bool:
    return stop.lat is not None and stop.lng is not None


def _city_coords(city) -> tuple[float, float] | None:
    if city is None or city.latitude is None or city.longitude is None:
        return None
    try:
        return float(city.latitude), float(city.longitude)
    except (TypeError, ValueError):
        return None


def match_city_coords_from_text(text: str) -> tuple[float, float] | None:
    """Match a catalog city name inside a free-text address."""
    if not text or not str(text).strip():
        return None
    needle = str(text).strip().lower()
    from apps.locations.models import City

    cities = City.objects.filter(
        latitude__isnull=False,
        longitude__isnull=False,
    ).only('latitude', 'longitude', 'name_uz', 'name_ru', 'name_en')
    best: tuple[float, float] | None = None
    best_len = 0
    for city in cities.iterator(chunk_size=500):
        for name in (city.name_uz, city.name_ru, city.name_en):
            if not name:
                continue
            token = name.strip().lower()
            if len(token) < 3 or token not in needle:
                continue
            if len(token) > best_len:
                coords = _city_coords(city)
                if coords:
                    best = coords
                    best_len = len(token)
    return best


def resolve_stop_coordinates(stop: OrderRouteStop, order: Order) -> tuple[float, float] | None:
    """Best-effort coordinates for a stop: address text, then ad city, then catalog match."""
    advertisement = getattr(order, 'advertisement', None)
    pickup = first_pickup_stop(order)
    delivery = last_delivery_stop(order)

    fallback_address = ''
    city_coords = None
    if advertisement:
        if pickup and stop.id == pickup.id:
            fallback_address = advertisement.departure_address or ''
            city_coords = _city_coords(getattr(advertisement, 'departure_city', None))
        elif delivery and stop.id == delivery.id:
            fallback_address = advertisement.destination_address or ''
            city_coords = _city_coords(getattr(advertisement, 'destination_city', None))

    return (
        parse_coords_from_address(stop.address or '')
        or parse_coords_from_address(fallback_address)
        or city_coords
        or match_city_coords_from_text(stop.address or '')
        or match_city_coords_from_text(fallback_address)
    )


def hydrate_missing_stop_coordinates(order: Order) -> list[OrderRouteStop]:
    """Fill blank stop coordinates from address text, advertisement cities, or catalog."""
    ensure_default_route_stops(order)
    advertisement = getattr(order, 'advertisement', None)
    if advertisement is not None:
        # Prefetch cities so pickup/delivery hydrate without extra queries per stop.
        _ = getattr(advertisement, 'departure_city', None)
        _ = getattr(advertisement, 'destination_city', None)
    updated = False
    for stop in order.route_stops.order_by('sequence'):
        if stop_has_coords(stop):
            continue
        coords = resolve_stop_coordinates(stop, order)
        if not coords:
            continue
        stop.lat = coords[0]
        stop.lng = coords[1]
        stop.save(update_fields=['lat', 'lng', 'updated_at'])
        updated = True
    if updated:
        sync_planned_route_from_stops(order)
    return list(order.route_stops.order_by('sequence'))


def require_geocoded_terminal_stops(order: Order) -> None:
    missing = [
        stop.sequence
        for stop in order.route_stops.order_by('sequence')
        if not stop_has_coords(stop)
    ]
    if missing:
        raise ValueError(
            'Safarni boshlash uchun barcha marshrut nuqtalarining koordinatasi kerak.'
        )


def first_pickup_stop(order: Order) -> OrderRouteStop | None:
    return (
        order.route_stops.filter(stop_type=OrderRouteStop.STOP_PICKUP)
        .order_by('sequence')
        .first()
    )


def last_delivery_stop(order: Order) -> OrderRouteStop | None:
    return (
        order.route_stops.filter(stop_type=OrderRouteStop.STOP_DELIVERY)
        .order_by('sequence')
        .last()
    )


def final_delivery_was_skipped(order: Order) -> bool:
    stop = last_delivery_stop(order)
    return bool(stop and stop.status == OrderRouteStop.STATUS_SKIPPED)


def validate_pod_at_delivery(order: Order, lat: float, lng: float) -> None:
    """POD must be taken at the last delivery object after it has coordinates."""
    hydrate_missing_stop_coordinates(order)
    stop = last_delivery_stop(order)
    if not stop:
        return
    if not stop_has_coords(stop):
        raise ValueError(
            "Yetkazish nuqtasida koordinata yo'q. Manzilni aniqlang yoki dispatcher bilan bog'laning."
        )
    if stop.status == OrderRouteStop.STATUS_PENDING:
        raise ValueError('Avval yetkazish manziliga yetib boring.')
    radius = float(stop.geofence_radius_meters or 300)
    distance = haversine_meters(float(lat), float(lng), float(stop.lat), float(stop.lng))
    if distance > radius:
        raise ValueError('POD yetkazish nuqtasida olinishi kerak.')


SKIP_REASONS = {
    'warehouse_closed': "Ombor yopiq",
    'customer_absent': "Qabul qiluvchi yo'q edi",
    'access_denied': 'Kirish mumkin emas',
    'other': 'Boshqa sabab',
}


def can_skip_route_stop(order: Order, stop: OrderRouteStop) -> bool:
    if stop.stop_type == OrderRouteStop.STOP_PICKUP:
        return False
    last_delivery = last_delivery_stop(order)
    if last_delivery and stop.id == last_delivery.id:
        return False
    return True


def format_skip_notes(skip_reason: str, skip_note: str = '') -> str:
    label = SKIP_REASONS.get(skip_reason, skip_reason)
    note = (skip_note or '').strip()
    composed = f'[skip:{skip_reason}] {label}'
    if note:
        composed = f'{composed}. {note}'
    return composed[:2000]


def skip_reason_display(notes: str) -> str:
    text = (notes or '').strip()
    if text.startswith('[skip:') and ']' in text:
        return text.split(']', 1)[1].strip()
    return text


def complete_route_stop(
    order: Order,
    stop_id: int,
    user,
    skip: bool = False,
    skip_reason: str = '',
    skip_note: str = '',
) -> OrderRouteStop:
    stop = OrderRouteStop.objects.get(pk=stop_id, order=order)

    if stop.status in _TERMINAL_STOP_STATUSES:
        raise ValueError('Stop already completed')

    first_incomplete = (
        order.route_stops.exclude(status__in=_TERMINAL_STOP_STATUSES)
        .order_by('sequence')
        .first()
    )
    if first_incomplete and first_incomplete.id != stop.id:
        raise ValueError('Complete route stops in order')

    if skip:
        if not can_skip_route_stop(order, stop):
            if stop.stop_type == OrderRouteStop.STOP_PICKUP:
                raise ValueError("Yuklash nuqtasini o'tkazib bo'lmaydi.")
            raise ValueError("Yetkazish nuqtasini o'tkazib bo'lmaydi.")
        reason = (skip_reason or '').strip()
        note = (skip_note or '').strip()
        if reason not in SKIP_REASONS:
            raise ValueError(
                "O'tkazib yuborish uchun sabab kerak (ombor yopiq, qabul qiluvchi yo'q, kirish yo'q)."
            )
        if reason == 'other' and len(note) < 5:
            raise ValueError("Boshqa sabab uchun izoh yozing (kamida 5 belgi).")
        stop.notes = format_skip_notes(reason, note)
    else:
        hydrate_missing_stop_coordinates(order)
        stop.refresh_from_db()
        if not stop_has_coords(stop):
            raise ValueError(
                "Bu nuqtada koordinata yo'q. Manzilni aniqlang yoki dispatcher bilan bog'laning."
            )
        if stop.status != OrderRouteStop.STATUS_ARRIVED:
            raise ValueError('Avval obyektga yetib boring.')

    now = timezone.now()
    if skip:
        stop.status = OrderRouteStop.STATUS_SKIPPED
    else:
        stop.status = OrderRouteStop.STATUS_COMPLETED
    stop.completed_at = now
    update_fields = ['status', 'completed_at', 'updated_at']
    if skip:
        update_fields.append('notes')
    stop.save(update_fields=update_fields)
    sync_planned_route_from_stops(order)

    if (
        not skip
        and stop.stop_type == OrderRouteStop.STOP_PICKUP
        and order.status.code == 'in_progress'
    ):
        try:
            from apps.orders.transitions import transition_order_to_in_transit

            transition_order_to_in_transit(order)
        except ValueError:
            pass

    return stop
