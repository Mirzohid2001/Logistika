from __future__ import annotations

from math import asin, cos, radians, sin, sqrt
from typing import Any

from django.db.models import QuerySet

from apps.locations.models import City

EARTH_RADIUS_KM = 6371.0
DEFAULT_MAX_DISTANCE_KM = 120.0


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    phi1, phi2 = radians(lat1), radians(lat2)
    dphi = radians(lat2 - lat1)
    dlambda = radians(lon2 - lon1)
    a = sin(dphi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(dlambda / 2) ** 2
    return 2 * EARTH_RADIUS_KM * asin(sqrt(a))


def find_nearest_city(
    latitude: float,
    longitude: float,
    *,
    max_distance_km: float = DEFAULT_MAX_DISTANCE_KM,
    queryset: QuerySet | None = None,
) -> tuple[City | None, float | None]:
    cities = queryset if queryset is not None else City.objects.all()
    cities = cities.filter(latitude__isnull=False, longitude__isnull=False).select_related('country')

    best: City | None = None
    best_distance: float | None = None
    for city in cities.iterator(chunk_size=500):
        try:
            distance = haversine_km(
                float(latitude),
                float(longitude),
                float(city.latitude),
                float(city.longitude),
            )
        except (TypeError, ValueError):
            continue
        if best_distance is None or distance < best_distance:
            best = city
            best_distance = distance

    if best is None or best_distance is None or best_distance > max_distance_km:
        return None, best_distance
    return best, best_distance


def serialize_nearest_city(city: City, distance_km: float, *, lang: str = 'uz') -> dict[str, Any]:
    name = getattr(city, f'name_{lang}', None) or city.name_uz or city.name_ru or city.name_en
    return {
        'id': city.id,
        'name': name,
        'name_uz': city.name_uz,
        'name_ru': city.name_ru,
        'name_en': city.name_en,
        'country_id': city.country_id,
        'latitude': float(city.latitude) if city.latitude is not None else None,
        'longitude': float(city.longitude) if city.longitude is not None else None,
        'distance_km': round(distance_km, 1),
    }
