from decimal import Decimal

from django.conf import settings
from django.db.models import Avg

from apps.orders.models import Order


FUEL_PRICE_UZS_PER_LITER = Decimal(getattr(settings, 'TRIP_FUEL_PRICE_UZS', '12000'))
FUEL_LITERS_PER_100KM = Decimal(getattr(settings, 'TRIP_FUEL_LITERS_PER_100KM', '28'))
DEFAULT_DISTANCE_KM = Decimal('450')
TOLL_UZS_PER_100KM = Decimal(getattr(settings, 'TRIP_TOLL_UZS_PER_100KM', '15000'))


def _lane_average_distance_km(departure_city_id: int, destination_city_id: int) -> Decimal | None:
    orders = Order.objects.filter(
        advertisement__departure_city_id=departure_city_id,
        advertisement__destination_city_id=destination_city_id,
        status__code='completed',
        optimized_route_distance_meters__isnull=False,
    ).aggregate(avg_distance=Avg('optimized_route_distance_meters'))
    avg_m = orders.get('avg_distance')
    if avg_m:
        return Decimal(str(avg_m)) / Decimal('1000')
    return None


def estimate_trip_profit(
    departure_city_id: int,
    destination_city_id: int,
    revenue: Decimal,
    *,
    distance_km: Decimal | None = None,
) -> dict:
    revenue = Decimal(str(revenue or 0))
    lane_distance = _lane_average_distance_km(departure_city_id, destination_city_id)
    estimated_distance_km = distance_km or lane_distance or DEFAULT_DISTANCE_KM
    estimated_distance_km = max(estimated_distance_km, Decimal('1'))

    fuel_cost = (estimated_distance_km / Decimal('100')) * FUEL_LITERS_PER_100KM * FUEL_PRICE_UZS_PER_LITER
    toll_estimate = (estimated_distance_km / Decimal('100')) * TOLL_UZS_PER_100KM
    total_cost = fuel_cost + toll_estimate
    net_profit = revenue - total_cost
    margin_percent = float((net_profit / revenue) * 100) if revenue > 0 else 0.0

    return {
        'currency': 'UZS',
        'revenue': float(revenue),
        'estimated_distance_km': float(estimated_distance_km.quantize(Decimal('1'))),
        'distance_source': 'historical' if lane_distance else ('provided' if distance_km else 'default'),
        'fuel_cost': float(fuel_cost.quantize(Decimal('1'))),
        'toll_estimate': float(toll_estimate.quantize(Decimal('1'))),
        'total_cost': float(total_cost.quantize(Decimal('1'))),
        'net_profit': float(net_profit.quantize(Decimal('1'))),
        'margin_percent': round(margin_percent, 1),
        'is_profitable': net_profit > 0,
        'fuel_price_per_liter': float(FUEL_PRICE_UZS_PER_LITER),
        'fuel_liters_per_100km': float(FUEL_LITERS_PER_100KM),
    }
