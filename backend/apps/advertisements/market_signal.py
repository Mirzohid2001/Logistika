from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

from django.utils import timezone

from apps.advertisements.models import Advertisement
from apps.orders.models import Order


def _to_decimal(value) -> Decimal | None:
    if value is None:
        return None
    try:
        return Decimal(str(value))
    except Exception:
        return None


def get_route_health(from_city_id: int, to_city_id: int, weight: Decimal | None = None) -> dict:
    now = timezone.now()
    ads_week_qs = Advertisement.objects.filter(
        departure_city_id=from_city_id,
        destination_city_id=to_city_id,
        created_at__gte=now - timedelta(days=7),
    )
    completed_orders_qs = Order.objects.filter(
        advertisement__departure_city_id=from_city_id,
        advertisement__destination_city_id=to_city_id,
        status__code='completed',
        created_at__gte=now - timedelta(days=30),
    ).select_related('advertisement')

    avg_close_hours = None
    close_times = []
    for order in completed_orders_qs[:100]:
        completed_at = order.completed_at or order.updated_at
        if completed_at and order.advertisement and order.advertisement.created_at:
            hours = (completed_at - order.advertisement.created_at).total_seconds() / 3600
            if hours > 0:
                close_times.append(hours)
    if close_times:
        avg_close_hours = round(sum(close_times) / len(close_times), 1)

    recent_ads_count = ads_week_qs.count()
    recent_completed_count = completed_orders_qs.count()

    if recent_ads_count >= 25:
        competition_level = 'high'
    elif recent_ads_count >= 10:
        competition_level = 'medium'
    else:
        competition_level = 'low'

    estimated_match_quality = 'unknown'
    if weight is not None:
        bucket_min = max(weight - Decimal('2000'), Decimal('0'))
        bucket_max = weight + Decimal('2000')
        bucket_orders = completed_orders_qs.filter(
            advertisement__weight__gte=bucket_min,
            advertisement__weight__lte=bucket_max,
        ).count()
        if bucket_orders >= 12:
            estimated_match_quality = 'high'
        elif bucket_orders >= 4:
            estimated_match_quality = 'medium'
        else:
            estimated_match_quality = 'low'

    recommendation = 'neutral'
    if recent_completed_count >= 5 and competition_level == 'low':
        recommendation = 'favorable'
    elif competition_level == 'high' and recent_completed_count < 3:
        recommendation = 'caution_high_competition'
    elif recent_completed_count == 0 and recent_ads_count >= 10:
        recommendation = 'caution_unproven_lane'

    return {
        'available': recent_ads_count > 0 or recent_completed_count > 0,
        'recent_posts_7d': recent_ads_count,
        'completed_orders_30d': recent_completed_count,
        'avg_close_hours': avg_close_hours,
        'competition_level': competition_level,
        'estimated_match_quality': estimated_match_quality,
        'recommendation': recommendation,
    }


def get_duplicate_risk(
    user,
    from_city_id: int,
    to_city_id: int,
    weight: Decimal | None = None,
    proposed_cost: Decimal | None = None,
) -> dict:
    now = timezone.now()
    recent_ads = Advertisement.objects.filter(
        client=user,
        departure_city_id=from_city_id,
        destination_city_id=to_city_id,
        created_at__gte=now - timedelta(days=14),
    ).order_by('-created_at')[:30]

    matches = []
    for ad in recent_ads:
        weight_ok = True
        cost_ok = True
        if weight is not None:
            ad_weight = _to_decimal(ad.weight)
            if ad_weight is None:
                weight_ok = False
            else:
                tolerance = max(weight * Decimal('0.15'), Decimal('300'))
                weight_ok = abs(ad_weight - weight) <= tolerance
        if proposed_cost is not None:
            ad_cost = _to_decimal(ad.proposed_cost)
            if ad_cost is None:
                cost_ok = False
            else:
                tolerance = max(proposed_cost * Decimal('0.2'), Decimal('100000'))
                cost_ok = abs(ad_cost - proposed_cost) <= tolerance
        if weight_ok and cost_ok:
            matches.append(
                {
                    'id': ad.id,
                    'title': ad.title_ru or ad.title_uz or ad.title_en,
                    'weight': float(ad.weight),
                    'proposed_cost': float(ad.proposed_cost) if ad.proposed_cost is not None else None,
                    'created_at': ad.created_at.isoformat(),
                    'is_closed': ad.is_closed,
                }
            )

    if len(matches) >= 5:
        risk_level = 'high'
    elif len(matches) >= 2:
        risk_level = 'medium'
    else:
        risk_level = 'low'

    should_delay = risk_level == 'high'
    should_review = risk_level == 'medium'

    return {
        'available': True,
        'risk_level': risk_level,
        'matches_count': len(matches),
        'matches': matches[:5],
        'should_delay': should_delay,
        'should_review': should_review,
    }
