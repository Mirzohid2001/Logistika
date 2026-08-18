from decimal import Decimal

from django.db.models import Avg, Count, Q

from apps.orders.models import Order
from apps.ratings.models import Complaint, Rating


def _tier_for_score(score: float) -> str:
    if score >= 90:
        return 'platinum'
    if score >= 75:
        return 'gold'
    if score >= 55:
        return 'silver'
    return 'bronze'


def get_user_trust(user, cache: dict | None = None) -> dict:
    """Return trust payload; optional per-request cache avoids duplicate DB work."""
    if cache is None:
        return compute_user_trust(user)
    user_id = user.pk
    if user_id not in cache:
        cache[user_id] = compute_user_trust(user)
    return cache[user_id]


def compute_user_trust(user) -> dict:
    rating_stats = Rating.objects.filter(to_user=user).aggregate(
        avg=Avg('rating'),
        total=Count('id'),
    )
    avg_rating = float(rating_stats['avg'] or 0)
    total_ratings = int(rating_stats['total'] or 0)

    if user.is_driver:
        role_filter = Q(driver=user)
    elif user.is_client:
        role_filter = Q(client=user)
    else:
        role_filter = Q(driver=user) | Q(client=user)

    order_stats = Order.objects.filter(role_filter).aggregate(
        total=Count('id'),
        completed=Count('id', filter=Q(status__code='completed')),
        cancelled=Count('id', filter=Q(status__code='cancelled')),
        rejected=Count('id', filter=Q(status__code='rejected')),
        stopped=Count('id', filter=Q(status__code='stopped')),
    )
    total_orders = int(order_stats['total'] or 0)
    completed_orders = int(order_stats['completed'] or 0)
    cancelled_orders = int(order_stats['cancelled'] or 0)
    failed_orders = int(order_stats['rejected'] or 0) + int(order_stats['stopped'] or 0)

    completion_rate = (completed_orders / total_orders) if total_orders else 0.0

    payment_settlement_rate = 0.0
    if user.is_driver and completed_orders:
        from apps.orders.financial import driver_settled_order_count, driver_disputed_order_count

        settled = driver_settled_order_count(user)
        disputed = driver_disputed_order_count(user)
        eligible = settled + disputed
        payment_settlement_rate = settled / eligible if eligible else 0.0

    if completed_orders:
        completed_qs = (
            Order.objects.filter(role_filter, status__code='completed')
            .select_related('advertisement')
            .order_by('-completed_at')[:200]
        )
        on_time_orders = 0
        eligible_for_on_time = 0
        for order in completed_qs:
            deadline = order.advertisement.delivery_deadline
            if not deadline:
                continue
            eligible_for_on_time += 1
            if order.completed_at and order.completed_at <= deadline:
                on_time_orders += 1
        on_time_rate = on_time_orders / eligible_for_on_time if eligible_for_on_time else 0.0
    else:
        on_time_rate = 0.0

    pending_complaints = Complaint.objects.filter(
        to_user=user,
        status__in=('pending', 'in_review'),
    ).count()

    rating_component = (avg_rating / 5.0) * 35 if total_ratings else 18
    completion_component = completion_rate * 25
    on_time_component = on_time_rate * 20
    payment_component = payment_settlement_rate * 10 if user.is_driver else 0
    complaint_penalty = min(pending_complaints * 8, 25)
    cancellation_penalty = (
        min(((cancelled_orders + failed_orders) / total_orders) * 15, 15) if total_orders else 0
    )

    score = max(
        0,
        min(
            100,
            round(
                rating_component
                + completion_component
                + on_time_component
                + payment_component
                - complaint_penalty
                - cancellation_penalty
            ),
        ),
    )

    return {
        'trust_score': score,
        'trust_tier': _tier_for_score(score),
        'trust_breakdown': {
            'average_rating': round(avg_rating, 2),
            'total_ratings': total_ratings,
            'completion_rate': round(completion_rate, 2),
            'on_time_rate': round(on_time_rate, 2),
            'payment_settlement_rate': round(payment_settlement_rate, 2),
            'pending_complaints': pending_complaints,
            'completed_orders': completed_orders,
        },
    }


def sort_entities_by_user_trust(items, user_attr: str, *, reverse: bool = True, cache: dict | None = None):
    """Sort model instances by related user's trust score (in-memory)."""
    trust_cache = cache if cache is not None else {}
    return sorted(
        items,
        key=lambda item: get_user_trust(getattr(item, user_attr), trust_cache)['trust_score'],
        reverse=reverse,
    )
