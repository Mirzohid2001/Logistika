from decimal import Decimal
from statistics import median

from django.db.models import Q

from apps.advertisements.models import Advertisement
from apps.bids.models import Bid
from apps.orders.models import Order


def _normalize_amount(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def _collect_lane_amounts(
    departure_city_id: int,
    destination_city_id: int,
    weight: Decimal | None = None,
) -> list[Decimal]:
    amounts: list[Decimal] = []

    ad_filter = Q(
        departure_city_id=departure_city_id,
        destination_city_id=destination_city_id,
        proposed_cost__isnull=False,
    )
    if weight is not None:
        low = weight * Decimal('0.7')
        high = weight * Decimal('1.3')
        ad_filter &= Q(weight__gte=low, weight__lte=high)

    for cost in Advertisement.objects.filter(ad_filter).values_list('proposed_cost', flat=True)[:120]:
        amount = _normalize_amount(cost)
        if amount and amount > 0:
            amounts.append(amount)

    bid_filter = Q(
        advertisement__departure_city_id=departure_city_id,
        advertisement__destination_city_id=destination_city_id,
        is_accepted_by_client=True,
    )
    if weight is not None:
        low = weight * Decimal('0.7')
        high = weight * Decimal('1.3')
        bid_filter &= Q(
            advertisement__weight__gte=low,
            advertisement__weight__lte=high,
        )

    for bid in Bid.objects.filter(bid_filter).select_related('advertisement')[:120]:
        amount = _normalize_amount(bid.get_current_amount())
        if amount and amount > 0:
            amounts.append(amount)

    completed_orders = Order.objects.filter(
        advertisement__departure_city_id=departure_city_id,
        advertisement__destination_city_id=destination_city_id,
        status__code='completed',
    ).select_related('advertisement', 'status')[:80]

    if weight is not None:
        low = float(weight) * 0.7
        high = float(weight) * 1.3
        completed_orders = [
            order for order in completed_orders
            if low <= float(order.advertisement.weight) <= high
        ]

    for order in completed_orders:
        amount = _normalize_amount(order.total_amount)
        if amount and amount > 0:
            amounts.append(amount)

    return amounts


def get_lane_price_insight(
    departure_city_id: int,
    destination_city_id: int,
    weight: Decimal | None = None,
) -> dict:
    amounts = _collect_lane_amounts(departure_city_id, destination_city_id, weight)
    if not amounts:
        return {
            'available': False,
            'sample_count': 0,
            'currency': 'UZS',
            'message': 'Bu yo\'nalish bo\'yicha hozircha yetarli tarixiy ma\'lumot yo\'q.',
        }

    amounts_sorted = sorted(amounts)
    total = sum(amounts_sorted, start=Decimal('0'))
    avg = total / len(amounts_sorted)
    med = Decimal(str(median([float(v) for v in amounts_sorted])))
    low = amounts_sorted[max(0, int(len(amounts_sorted) * 0.15))]
    high = amounts_sorted[min(len(amounts_sorted) - 1, int(len(amounts_sorted) * 0.85))]

    price_per_kg = None
    if weight and weight > 0:
        price_per_kg = (avg / weight).quantize(Decimal('1'))

    return {
        'available': True,
        'sample_count': len(amounts_sorted),
        'currency': 'UZS',
        'min_amount': float(low),
        'max_amount': float(high),
        'median_amount': float(med),
        'average_amount': float(avg.quantize(Decimal('1'))),
        'suggested_amount': float(med.quantize(Decimal('1'))),
        'price_per_kg': float(price_per_kg) if price_per_kg is not None else None,
        'confidence': 'high' if len(amounts_sorted) >= 12 else 'medium' if len(amounts_sorted) >= 5 else 'low',
    }
