from __future__ import annotations

import logging
from math import radians, cos, sin, asin, sqrt
from typing import Any
from urllib.parse import urlencode

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    return r * 2 * asin(sqrt(a))


def _fallback_route(stops: list[dict]) -> dict[str, Any]:
    coords = [(float(s['lat']), float(s['lng'])) for s in stops]
    distance = 0.0
    for i in range(1, len(coords)):
        distance += _haversine_meters(*coords[i - 1], *coords[i])
    duration = int(max(distance / 1000.0 / 40.0 * 3600, 60))
    return {
        'ordered_stop_ids': [s['id'] for s in stops],
        'polyline': [{'lat': lat, 'lng': lng} for lat, lng in coords],
        'distance_meters': int(distance),
        'duration_seconds': duration,
        'provider': 'haversine',
    }


def _optimize_with_google(stops: list[dict], preference: str) -> dict[str, Any] | None:
    api_key = getattr(settings, 'GOOGLE_MAPS_API_KEY', '') or ''
    if not api_key or len(stops) < 2:
        return None

    origin = f"{stops[0]['lat']},{stops[0]['lng']}"
    destination = f"{stops[-1]['lat']},{stops[-1]['lng']}"
    middle = stops[1:-1]
    params: dict[str, str] = {
        'origin': origin,
        'destination': destination,
        'key': api_key,
        'mode': 'driving',
    }
    if middle:
        waypoint_str = 'optimize:true|' + '|'.join(f"{s['lat']},{s['lng']}" for s in middle)
        params['waypoints'] = waypoint_str
    if preference == 'no_toll':
        params['avoid'] = 'tolls'

    try:
        response = requests.get(
            'https://maps.googleapis.com/maps/api/directions/json',
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get('status') != 'OK':
            logger.warning('Google Directions status: %s', payload.get('status'))
            return None

        route = payload['routes'][0]
        waypoint_order = route.get('waypoint_order', list(range(len(middle))))
        ordered = [stops[0]]
        for idx in waypoint_order:
            ordered.append(middle[idx])
        if len(stops) > 1:
            ordered.append(stops[-1])

        polyline = []
        for leg in route.get('legs', []):
            for step in leg.get('steps', []):
                end = step['end_location']
                polyline.append({'lat': end['lat'], 'lng': end['lng']})

        total_distance = sum(leg.get('distance', {}).get('value', 0) for leg in route.get('legs', []))
        total_duration = sum(leg.get('duration', {}).get('value', 0) for leg in route.get('legs', []))
        return {
            'ordered_stop_ids': [s['id'] for s in ordered],
            'polyline': polyline or [{'lat': s['lat'], 'lng': s['lng']} for s in ordered],
            'distance_meters': int(total_distance),
            'duration_seconds': int(total_duration),
            'provider': 'google',
        }
    except Exception as exc:
        logger.exception('Google routing failed: %s', exc)
        return None


def _optimize_with_yandex(stops: list[dict], preference: str) -> dict[str, Any] | None:
    api_key = getattr(settings, 'YANDEX_ROUTING_API_KEY', '') or ''
    if not api_key or len(stops) < 2:
        return None

    waypoints = '|'.join(f"{s['lng']},{s['lat']}" for s in stops)
    params = {
        'apikey': api_key,
        'waypoints': waypoints,
        'mode': 'driving',
    }
    if preference == 'no_toll':
        params['avoid_tolls'] = 'true'

    try:
        response = requests.get(
            'https://api.routing.yandex.net/v2/route',
            params=params,
            timeout=15,
        )
        response.raise_for_status()
        payload = response.json()
        route = payload.get('route') or payload.get('routes', [{}])[0]
        legs = route.get('legs', [])
        polyline = []
        distance = 0
        duration = 0
        for leg in legs:
            distance += leg.get('length', 0)
            duration += leg.get('duration', 0)
            for point in leg.get('points', []):
                polyline.append({'lat': point[1], 'lng': point[0]})

        return {
            'ordered_stop_ids': [s['id'] for s in stops],
            'polyline': polyline or [{'lat': s['lat'], 'lng': s['lng']} for s in stops],
            'distance_meters': int(distance),
            'duration_seconds': int(duration),
            'provider': 'yandex',
        }
    except Exception as exc:
        logger.exception('Yandex routing failed: %s', exc)
        return None


def optimize_route(stops: list[dict], preference: str = 'balanced') -> dict[str, Any]:
    """
    Optimize visit order and return polyline + metrics.
    Each stop dict must include: id, lat, lng.
    """
    valid = [s for s in stops if s.get('lat') is not None and s.get('lng') is not None]
    if len(valid) < 2:
        raise ValueError('At least two stops with coordinates are required')

    provider_order = getattr(settings, 'ROUTING_PROVIDER_PRIORITY', 'google,yandex,haversine').split(',')
    for provider in provider_order:
        provider = provider.strip().lower()
        if provider == 'google':
            result = _optimize_with_google(valid, preference)
            if result:
                return result
        elif provider == 'yandex':
            result = _optimize_with_yandex(valid, preference)
            if result:
                return result
        elif provider == 'haversine':
            return _fallback_route(valid)

    return _fallback_route(valid)
