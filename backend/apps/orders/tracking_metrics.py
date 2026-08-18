"""Shared ETA and route progress calculations for orders."""

from __future__ import annotations

from typing import Any

from apps.orders.route_stops import haversine_meters

DEFAULT_SPEED_KMH = 40.0
MIN_SPEED_KMH = 20.0
MAX_SPEED_KMH = 80.0
FINISHED_STOP_STATUSES = frozenset({'completed', 'skipped'})


def normalize_route_point(point: Any) -> dict | None:
    if not isinstance(point, dict):
        return None
    try:
        return {
            'lat': float(point['lat']),
            'lng': float(point['lng']),
            'status': point.get('status') or 'pending',
        }
    except (KeyError, TypeError, ValueError):
        return None


def get_navigation_points(route_points: list | None) -> list[dict]:
    if not isinstance(route_points, list):
        return []
    return [
        point
        for point in (normalize_route_point(raw) for raw in route_points)
        if point is not None
    ]


def get_next_target_index(points: list[dict]) -> int | None:
    if not points:
        return None
    for index, point in enumerate(points):
        if point['status'] not in FINISHED_STOP_STATUSES:
            return index
    return len(points) - 1


def leg_distance_m(left: dict, right: dict) -> float:
    return haversine_meters(left['lat'], left['lng'], right['lat'], right['lng'])


def total_route_distance_m(points: list[dict]) -> float:
    if len(points) < 2:
        return 0.0
    return sum(
        leg_distance_m(points[index], points[index + 1])
        for index in range(len(points) - 1)
    )


def remaining_route_distance_m(
    current_lat: float,
    current_lng: float,
    points: list[dict],
) -> float | None:
    if not points:
        return None

    target_index = get_next_target_index(points)
    if target_index is None:
        return None

    target = points[target_index]
    remaining = haversine_meters(current_lat, current_lng, target['lat'], target['lng'])
    for index in range(target_index, len(points) - 1):
        remaining += leg_distance_m(points[index], points[index + 1])
    return remaining


def derive_speed_kmh_from_tracks(tracks, *, default_speed_kmh: float = DEFAULT_SPEED_KMH) -> float:
    if not tracks or len(tracks) < 2:
        return default_speed_kmh

    newest = tracks[0]
    previous = tracks[1]
    delta_sec = max((newest.timestamp - previous.timestamp).total_seconds(), 1)
    dist_m = haversine_meters(
        float(previous.lat),
        float(previous.lng),
        float(newest.lat),
        float(newest.lng),
    )
    derived_speed = (dist_m / 1000.0) / (delta_sec / 3600.0)
    return max(MIN_SPEED_KMH, min(derived_speed, MAX_SPEED_KMH))


def estimate_eta_minutes(order, recent_tracks=None) -> int | None:
    points = get_navigation_points(order.planned_route_points)
    if not points:
        return None
    if order.current_location_lat is None or order.current_location_lng is None:
        return None

    try:
        current_lat = float(order.current_location_lat)
        current_lng = float(order.current_location_lng)
    except (TypeError, ValueError):
        return None

    remaining_m = remaining_route_distance_m(current_lat, current_lng, points)
    if remaining_m is None:
        return None

    if recent_tracks is None:
        from apps.orders.models import OrderLocationTrack

        recent_tracks = list(
            OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')[:2]
        )

    speed_kmh = derive_speed_kmh_from_tracks(recent_tracks)
    eta_minutes = int((remaining_m / 1000.0) / speed_kmh * 60.0)
    return max(eta_minutes, 1)


def compute_route_progress(
    current_lat: float,
    current_lng: float,
    points: list[dict],
) -> tuple[int | None, float | None]:
    """Return (progress_percent, remaining_distance_km)."""
    total_m = total_route_distance_m(points)
    remaining_m = remaining_route_distance_m(current_lat, current_lng, points)
    if total_m <= 0 or remaining_m is None:
        return None, None

    progress_percent = max(0, min(int((1 - (remaining_m / total_m)) * 100), 100))
    remaining_distance_km = round(remaining_m / 1000.0, 1)
    return progress_percent, remaining_distance_km
