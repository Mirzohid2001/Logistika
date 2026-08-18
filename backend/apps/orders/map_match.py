from __future__ import annotations

from dataclasses import dataclass
from math import atan2, cos, degrees, radians, sin
from typing import Any, Iterable, Sequence


EARTH_RADIUS_M = 6371000.0
# GPS wobble off the centerline; beyond this keep raw coords (true off-route).
DEFAULT_MAX_SNAP_METERS = 80.0
# Allow small GPS reverse jitter along the route without fighting the driver.
DEFAULT_BACKTRACK_TOLERANCE_M = 40.0


@dataclass(frozen=True)
class SnapResult:
    lat: float
    lng: float
    distance_m: float
    heading: float | None
    progress_m: float
    snapped: bool


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    from math import asin, sqrt

    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return EARTH_RADIUS_M * 2 * asin(sqrt(a))


def bearing_degrees(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    lat1_r, lat2_r = radians(lat1), radians(lat2)
    d_lng = radians(lng2 - lng1)
    y = sin(d_lng) * cos(lat2_r)
    x = cos(lat1_r) * sin(lat2_r) - sin(lat1_r) * cos(lat2_r) * cos(d_lng)
    return (degrees(atan2(y, x)) + 360.0) % 360.0


def normalize_route_points(points: Iterable[Any] | None) -> list[tuple[float, float]]:
    """Accept [{lat,lng}|[lat,lng]| (lat,lng)] and drop invalid/duplicate consecutive points."""
    if not points:
        return []
    normalized: list[tuple[float, float]] = []
    for point in points:
        lat = lng = None
        if isinstance(point, dict):
            lat = point.get('lat', point.get('latitude'))
            lng = point.get('lng', point.get('longitude'))
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            lat, lng = point[0], point[1]
        try:
            lat_f = float(lat)
            lng_f = float(lng)
        except (TypeError, ValueError):
            continue
        if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
            continue
        if normalized and abs(normalized[-1][0] - lat_f) < 1e-7 and abs(normalized[-1][1] - lng_f) < 1e-7:
            continue
        normalized.append((lat_f, lng_f))
    return normalized


def get_match_polyline(order) -> list[tuple[float, float]]:
    """Prefer dense optimized polyline; fall back to planned route points."""
    optimized = normalize_route_points(getattr(order, 'optimized_route_polyline', None))
    if len(optimized) >= 2:
        return optimized
    planned = normalize_route_points(getattr(order, 'planned_route_points', None))
    if len(planned) >= 2:
        return planned
    return []


def _project_onto_segment(
    lat: float,
    lng: float,
    a_lat: float,
    a_lng: float,
    b_lat: float,
    b_lng: float,
) -> tuple[float, float, float, float]:
    """Return (proj_lat, proj_lng, distance_m, t in [0,1])."""
    avg_lat_rad = radians((a_lat + b_lat) / 2)
    x1 = radians(a_lng) * cos(avg_lat_rad)
    y1 = radians(a_lat)
    x2 = radians(b_lng) * cos(avg_lat_rad)
    y2 = radians(b_lat)
    px = radians(lng) * cos(avg_lat_rad)
    py = radians(lat)

    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return a_lat, a_lng, haversine_meters(lat, lng, a_lat, a_lng), 0.0

    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy
    proj_lng = degrees(proj_x / cos(avg_lat_rad))
    proj_lat = degrees(proj_y)
    return proj_lat, proj_lng, haversine_meters(lat, lng, proj_lat, proj_lng), t


def estimate_progress_along_route(
    lat: float,
    lng: float,
    points: Sequence[tuple[float, float]],
) -> float | None:
    snap = snap_to_route(lat, lng, points, max_snap_meters=10_000, enforce_progress=False)
    return snap.progress_m if snap else None


def snap_to_route(
    lat: float,
    lng: float,
    points: Sequence[tuple[float, float]] | None,
    *,
    max_snap_meters: float = DEFAULT_MAX_SNAP_METERS,
    previous_progress_m: float | None = None,
    backtrack_tolerance_m: float = DEFAULT_BACKTRACK_TOLERANCE_M,
    enforce_progress: bool = True,
) -> SnapResult | None:
    """
    Snap a GPS fix onto the nearest route polyline segment (Yandex-like map match).

    If the point is farther than max_snap_meters, returns snapped=False with raw coords
    so callers can keep displaying free GPS while marking off-route.
    """
    route = list(points or [])
    if len(route) < 2:
        return None

    cumulative = [0.0]
    for i in range(1, len(route)):
        cumulative.append(
            cumulative[-1]
            + haversine_meters(route[i - 1][0], route[i - 1][1], route[i][0], route[i][1])
        )

    best: tuple[float, float, float, float, float] | None = None  # dist, lat, lng, heading, progress
    best_forward: tuple[float, float, float, float, float] | None = None

    min_allowed = None
    if enforce_progress and previous_progress_m is not None:
        min_allowed = previous_progress_m - backtrack_tolerance_m

    for idx in range(len(route) - 1):
        a_lat, a_lng = route[idx]
        b_lat, b_lng = route[idx + 1]
        proj_lat, proj_lng, dist_m, t = _project_onto_segment(lat, lng, a_lat, a_lng, b_lat, b_lng)
        seg_len = cumulative[idx + 1] - cumulative[idx]
        progress = cumulative[idx] + seg_len * t
        heading = bearing_degrees(a_lat, a_lng, b_lat, b_lng) if seg_len >= 1.0 else None
        candidate = (dist_m, proj_lat, proj_lng, heading if heading is not None else -1.0, progress)

        if best is None or dist_m < best[0]:
            best = candidate
        if min_allowed is None or progress >= min_allowed:
            if best_forward is None or dist_m < best_forward[0]:
                best_forward = candidate

    chosen = best_forward or best
    if chosen is None:
        return None

    dist_m, snap_lat, snap_lng, heading_raw, progress = chosen
    heading = None if heading_raw < 0 else heading_raw
    if dist_m > max_snap_meters:
        return SnapResult(
            lat=lat,
            lng=lng,
            distance_m=dist_m,
            heading=None,
            progress_m=progress,
            snapped=False,
        )
    return SnapResult(
        lat=snap_lat,
        lng=snap_lng,
        distance_m=dist_m,
        heading=heading,
        progress_m=progress,
        snapped=True,
    )


def match_live_location(
    order,
    lat: float,
    lng: float,
    *,
    max_snap_meters: float = DEFAULT_MAX_SNAP_METERS,
) -> SnapResult | None:
    polyline = get_match_polyline(order)
    if len(polyline) < 2:
        return None

    previous_progress = None
    if order.current_location_lat is not None and order.current_location_lng is not None:
        previous_progress = estimate_progress_along_route(
            float(order.current_location_lat),
            float(order.current_location_lng),
            polyline,
        )

    return snap_to_route(
        lat,
        lng,
        polyline,
        max_snap_meters=max_snap_meters,
        previous_progress_m=previous_progress,
    )
