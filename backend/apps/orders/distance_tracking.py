"""GPS-based driven distance for orders (informational only, not used for billing)."""

from __future__ import annotations

from datetime import datetime

from django.utils import timezone

from apps.orders.models import Order, OrderLocationTrack
from apps.orders.route_stops import haversine_meters
from apps.orders.tracking_metrics import get_navigation_points, total_route_distance_m

MAX_JUMP_METERS = 20_000
MIN_SEGMENT_METERS = 5
STATIONARY_MPS = 1.0


def _ordered_track_samples(order: Order) -> list[tuple[float, float, datetime]]:
    tracks = (
        OrderLocationTrack.objects.filter(order=order)
        .order_by('timestamp')
        .values_list('lat', 'lng', 'timestamp')
    )
    samples: list[tuple[float, float, datetime]] = []
    for lat, lng, ts in tracks:
        try:
            samples.append((float(lat), float(lng), ts))
        except (TypeError, ValueError):
            continue
    return samples


def _ordered_track_points(order: Order) -> list[tuple[float, float]]:
    return [(lat, lng) for lat, lng, _ts in _ordered_track_samples(order)]


def _loaded_started_at(order: Order) -> datetime | None:
    if order.in_transit_at:
        return order.in_transit_at
    pickup = (
        order.route_stops.filter(stop_type='pickup', completed_at__isnull=False)
        .order_by('sequence')
        .first()
    )
    if pickup and pickup.completed_at:
        return pickup.completed_at
    return None


def compute_distance_breakdown(order: Order) -> dict[str, int]:
    """Sum haversine legs, dropping GPS jumps and dock drift while stationary."""
    samples = _ordered_track_samples(order)
    if len(samples) < 2:
        return {'tracked_m': 0, 'loaded_m': 0, 'deadhead_m': 0}

    loaded_after = _loaded_started_at(order)
    total = 0.0
    loaded = 0.0
    previous = samples[0]
    for current in samples[1:]:
        segment = haversine_meters(previous[0], previous[1], current[0], current[1])
        dt = max((current[2] - previous[2]).total_seconds(), 0.0)
        previous = current
        if segment > MAX_JUMP_METERS:
            continue
        if dt > 0 and (segment / dt) < STATIONARY_MPS:
            continue
        if segment < MIN_SEGMENT_METERS:
            continue
        total += segment
        if loaded_after is None or current[2] >= loaded_after:
            loaded += segment

    tracked_m = int(round(total))
    loaded_m = int(round(loaded))
    deadhead_m = max(tracked_m - loaded_m, 0)
    return {'tracked_m': tracked_m, 'loaded_m': loaded_m, 'deadhead_m': deadhead_m}


def compute_tracked_distance_meters(order: Order, *, points: list[tuple[float, float]] | None = None) -> int:
    """Sum haversine legs between GPS points, filtering jumps and GPS noise."""
    if points is not None:
        if len(points) < 2:
            return 0
        total = 0.0
        previous = points[0]
        for current in points[1:]:
            segment = haversine_meters(previous[0], previous[1], current[0], current[1])
            if segment > MAX_JUMP_METERS:
                previous = current
                continue
            if segment >= MIN_SEGMENT_METERS:
                total += segment
                previous = current
        return int(round(total))
    return compute_distance_breakdown(order)['tracked_m']


def persist_tracked_distance(order: Order) -> int:
    breakdown = compute_distance_breakdown(order)
    order.tracked_distance_meters = breakdown['tracked_m']
    order.loaded_distance_meters = breakdown['loaded_m']
    order.tracked_distance_computed_at = timezone.now()
    order.save(
        update_fields=[
            'tracked_distance_meters',
            'loaded_distance_meters',
            'tracked_distance_computed_at',
            'updated_at',
        ]
    )
    return breakdown['tracked_m']


def _straight_line_planned_meters(order: Order) -> int | None:
    points = get_navigation_points(order.planned_route_points)
    if len(points) < 2:
        stop_points = []
        for stop in order.route_stops.order_by('sequence'):
            if stop.lat is None or stop.lng is None:
                continue
            try:
                stop_points.append({
                    'lat': float(stop.lat),
                    'lng': float(stop.lng),
                    'status': stop.status or 'pending',
                })
            except (TypeError, ValueError):
                continue
        points = get_navigation_points(stop_points)
    if len(points) < 2:
        return None
    meters = total_route_distance_m(points)
    return int(round(meters)) if meters > 0 else None


def _planned_distance_meters(order: Order) -> tuple[int | None, str | None]:
    if order.optimized_route_distance_meters:
        provider = (order.route_optimization_provider or '').strip().lower()
        if provider and provider != 'haversine':
            return int(order.optimized_route_distance_meters), 'optimized'
        if provider == 'haversine':
            return int(order.optimized_route_distance_meters), 'straight_line'
        return int(order.optimized_route_distance_meters), 'optimized'

    straight_line = _straight_line_planned_meters(order)
    if straight_line:
        return straight_line, 'straight_line'
    return None, None


def ensure_estimated_route_distance(order: Order) -> bool:
    """Persist straight-line planned distance when road routing was not run."""
    if order.optimized_route_distance_meters:
        return False
    meters, _ = _planned_distance_meters(order)
    if not meters:
        return False
    order.optimized_route_distance_meters = meters
    order.route_optimization_provider = 'haversine'
    order.save(
        update_fields=[
            'optimized_route_distance_meters',
            'route_optimization_provider',
            'updated_at',
        ]
    )
    return True


def on_order_completed(order: Order) -> int:
    """Finalize distance metrics when an order reaches completed status."""
    update_fields = []
    if order.completed_at is None:
        order.completed_at = timezone.now()
        update_fields.append('completed_at')
    if update_fields:
        update_fields.append('updated_at')
        order.save(update_fields=update_fields)
    ensure_estimated_route_distance(order)
    return persist_tracked_distance(order)


def _km(meters: int | None) -> float | None:
    if meters is None:
        return None
    return round(meters / 1000.0, 1)


def build_distance_summary(order: Order) -> dict:
    points = _ordered_track_points(order)
    is_completed = getattr(order.status, 'code', None) == 'completed'
    breakdown = compute_distance_breakdown(order)

    if is_completed and order.tracked_distance_meters is not None:
        tracked_m = int(order.tracked_distance_meters)
        loaded_m = int(order.loaded_distance_meters) if order.loaded_distance_meters is not None else breakdown['loaded_m']
        is_final = True
    else:
        tracked_m = breakdown['tracked_m']
        loaded_m = breakdown['loaded_m']
        is_final = False

    deadhead_m = max(tracked_m - loaded_m, 0)
    planned_m, planned_source = _planned_distance_meters(order)
    planned_km = _km(planned_m)
    tracked_km = _km(tracked_m) or 0.0
    loaded_km = _km(loaded_m) or 0.0
    deadhead_km = _km(deadhead_m) or 0.0
    comparable_km = loaded_km if loaded_m else tracked_km
    delta_km = None
    if planned_km is not None:
        delta_km = round(comparable_km - planned_km, 1)

    return {
        'planned_distance_km': planned_km,
        'planned_distance_source': planned_source,
        'tracked_distance_km': tracked_km,
        'loaded_distance_km': loaded_km,
        'deadhead_distance_km': deadhead_km,
        'distance_delta_km': delta_km,
        'is_final': is_final,
        'track_points_used': len(points),
    }
