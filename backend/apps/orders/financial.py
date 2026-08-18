"""Central financial calculations for offline P2P settlement and optional platform payments."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal

from django.conf import settings
from django.db.models import F, Q, Sum, Value
from django.db.models.functions import Coalesce

from apps.orders.models import Order


ESCROW_LEDGER_STATUSES = ('funded', 'held', 'released', 'refunded', 'cancelled')


def platform_payments_enabled() -> bool:
    return bool(getattr(settings, 'ORDER_PLATFORM_PAYMENTS_ENABLED', False))


def resolved_order_amount(order: Order) -> Decimal:
    if order.agreed_amount is not None:
        return order.agreed_amount
    return order.total_amount or Decimal('0')


def settled_orders_q() -> Q:
    """Completed + client confirmed. Escrow-ledger orders are counted via wallet/escrow."""
    return Q(status__code='completed', client_payment_confirmed=True) & ~Q(
        escrow__status__in=ESCROW_LEDGER_STATUSES
    )


def disputed_orders_q() -> Q:
    return Q(client_paid_reported=True) & ~Q(client_payment_confirmed=True)


def _apply_completed_date_filter(qs, date_from: date | None, date_to: date | None):
    if date_from:
        qs = qs.filter(completed_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(completed_at__date__lte=date_to)
    return qs


def _month_bounds(anchor: date, months_ago: int) -> tuple[date, date]:
    """Calendar month start/end for `months_ago` months before anchor's month."""
    year = anchor.year
    month = anchor.month - months_ago
    while month <= 0:
        month += 12
        year -= 1
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year, 12, 31)
    else:
        month_end = date(year, month + 1, 1) - timedelta(days=1)
    return month_start, month_end


def driver_settled_orders_qs(
    driver,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
):
    qs = Order.objects.filter(driver=driver).filter(settled_orders_q())
    return _apply_completed_date_filter(qs, date_from, date_to)


def client_settled_orders_qs(
    client,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
):
    qs = Order.objects.filter(client=client).filter(settled_orders_q())
    return _apply_completed_date_filter(qs, date_from, date_to)


def _orders_for_amount_resolution(queryset):
    """Eager, narrow fetch — avoids Postgres server-side cursors.

    ``QuerySet.iterator()`` uses named cursors on PostgreSQL. If a query fails mid-stream
    (e.g. missing column during a rolling deploy), closing the cursor raises
    ``InvalidCursorName`` and masks the real error. Settled-order volumes are small
    enough that a normal fetch is safer and clearer.
    """
    return queryset.select_related('advertisement', 'source_bid').only(
        'id',
        'agreed_amount',
        'created_at',
        'client_id',
        'driver_id',
        'advertisement_id',
        'source_bid_id',
        'advertisement__proposed_cost',
        'source_bid__proposed_amounts',
        'source_bid__updated_at',
    )


def sum_order_amounts(queryset) -> Decimal:
    total = Decimal('0')
    for order in _orders_for_amount_resolution(queryset):
        amount = resolved_order_amount(order)
        if amount > 0:
            total += amount
    return total


def count_positive_amount_orders(queryset) -> int:
    count = 0
    for order in _orders_for_amount_resolution(queryset):
        if resolved_order_amount(order) > 0:
            count += 1
    return count


def _platform_payment_net_expression():
    return Coalesce(F('amount'), Value(Decimal('0'))) - Coalesce(F('refund_amount'), Value(Decimal('0')))


def _sum_platform_payments_for_driver(
    driver,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    if not platform_payments_enabled():
        return Decimal('0')

    from apps.payments.models import Payment

    qs = Payment.objects.filter(
        order__driver=driver,
        payment_status='completed',
    ).exclude(
        order__client_payment_confirmed=True,
    ).exclude(
        order__escrow__status__in=ESCROW_LEDGER_STATUSES,
    )
    if date_from:
        qs = qs.filter(paid_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(paid_at__date__lte=date_to)
    return qs.aggregate(total=Sum(_platform_payment_net_expression()))['total'] or Decimal('0')


def _sum_platform_payments_for_client(
    client,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    if not platform_payments_enabled():
        return Decimal('0')

    from apps.payments.models import Payment

    qs = Payment.objects.filter(
        user=client,
        payment_status='completed',
    ).exclude(
        order__client_payment_confirmed=True,
    ).exclude(
        order__escrow__status__in=ESCROW_LEDGER_STATUSES,
    )
    if date_from:
        qs = qs.filter(paid_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(paid_at__date__lte=date_to)
    return qs.aggregate(total=Sum(_platform_payment_net_expression()))['total'] or Decimal('0')


def driver_escrow_released_earnings(
    driver,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    from apps.payments.models import OrderEscrow

    qs = OrderEscrow.objects.filter(
        order__driver=driver,
        status=OrderEscrow.STATUS_RELEASED,
    )
    if date_from:
        qs = qs.filter(released_at__date__gte=date_from)
    if date_to:
        qs = qs.filter(released_at__date__lte=date_to)
    return qs.aggregate(total=Sum('released_to_driver'))['total'] or Decimal('0')


def driver_gross_settled_earnings(
    driver,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    offline = sum_order_amounts(driver_settled_orders_qs(driver, date_from=date_from, date_to=date_to))
    platform = _sum_platform_payments_for_driver(driver, date_from=date_from, date_to=date_to)
    escrow = driver_escrow_released_earnings(driver, date_from=date_from, date_to=date_to)
    return offline + platform + escrow


def client_gross_settled_spend(
    client,
    *,
    date_from: date | None = None,
    date_to: date | None = None,
) -> Decimal:
    offline = sum_order_amounts(client_settled_orders_qs(client, date_from=date_from, date_to=date_to))
    platform = _sum_platform_payments_for_client(client, date_from=date_from, date_to=date_to)
    return offline + platform


def driver_payout_reserved(driver) -> Decimal:
    from apps.users.models import DriverPayoutRequest

    return DriverPayoutRequest.objects.filter(
        user=driver,
        status__in=(
            DriverPayoutRequest.STATUS_PENDING,
            DriverPayoutRequest.STATUS_PAID,
        ),
    ).aggregate(total=Sum('amount'))['total'] or Decimal('0')


def driver_available_payout_balance(driver) -> Decimal:
    from apps.payments.ledger import ensure_wallet

    wallet = ensure_wallet(driver)
    return max(Decimal('0'), wallet.available)


def driver_settled_order_count(driver, *, date_from: date | None = None, date_to: date | None = None) -> int:
    return count_positive_amount_orders(
        driver_settled_orders_qs(driver, date_from=date_from, date_to=date_to)
    )


def driver_disputed_order_count(driver) -> int:
    return Order.objects.filter(driver=driver).filter(disputed_orders_q()).count()


def average_settled_order_amount(queryset) -> Decimal:
    count = count_positive_amount_orders(queryset)
    if not count:
        return Decimal('0')
    return sum_order_amounts(queryset) / Decimal(count)


def earnings_by_completed_date(
    driver,
    range_start: date,
    range_end: date,
) -> list[dict]:
    rows = []
    days_span = (range_end - range_start).days + 1
    for i in range(days_span):
        day = range_start + timedelta(days=i)
        amount = driver_gross_settled_earnings(driver, date_from=day, date_to=day)
        rows.append({'date': day.isoformat(), 'earnings': float(amount)})
    return rows


def spending_by_completed_date(
    client,
    range_start: date,
    range_end: date,
) -> list[dict]:
    rows = []
    days_span = (range_end - range_start).days + 1
    for i in range(days_span):
        day = range_start + timedelta(days=i)
        amount = client_gross_settled_spend(client, date_from=day, date_to=day)
        rows.append({'date': day.isoformat(), 'spending': float(amount)})
    return rows


def monthly_settled_totals_for_driver(driver, months: int = 6) -> list[dict]:
    from django.utils import timezone

    today = timezone.now().date()
    rows = []
    for i in range(months - 1, -1, -1):
        month_start, month_end = _month_bounds(today, i)
        amount = driver_gross_settled_earnings(
            driver,
            date_from=month_start,
            date_to=month_end,
        )
        rows.append({'month': month_start.strftime('%Y-%m'), 'earnings': float(amount)})
    return rows


def monthly_settled_totals_for_client(client, months: int = 6) -> list[dict]:
    from django.utils import timezone

    today = timezone.now().date()
    rows = []
    for i in range(months - 1, -1, -1):
        month_start, month_end = _month_bounds(today, i)
        amount = client_gross_settled_spend(
            client,
            date_from=month_start,
            date_to=month_end,
        )
        rows.append({'month': month_start.strftime('%Y-%m'), 'spending': float(amount)})
    return rows


def route_totals_from_settled_orders(orders_qs, *, amount_key: str, limit: int = 10) -> list[dict]:
    buckets: dict[tuple[str, str], dict] = defaultdict(lambda: {'count': 0, 'total': Decimal('0')})
    qs = orders_qs.select_related(
        'advertisement__departure_city',
        'advertisement__destination_city',
        'source_bid',
    ).only(
        'id',
        'agreed_amount',
        'created_at',
        'client_id',
        'driver_id',
        'advertisement_id',
        'source_bid_id',
        'advertisement__proposed_cost',
        'advertisement__departure_city__name_uz',
        'advertisement__destination_city__name_uz',
        'source_bid__proposed_amounts',
        'source_bid__updated_at',
    )
    for order in qs:
        advertisement = order.advertisement
        from_city = getattr(advertisement.departure_city, 'name_uz', '') or ''
        to_city = getattr(advertisement.destination_city, 'name_uz', '') or ''
        key = (from_city, to_city)
        buckets[key]['count'] += 1
        buckets[key]['total'] += resolved_order_amount(order)

    sorted_routes = sorted(buckets.items(), key=lambda item: item[1]['count'], reverse=True)[:limit]
    return [
        {
            'from': key[0],
            'to': key[1],
            'count': value['count'],
            amount_key: float(value['total']),
        }
        for key, value in sorted_routes
    ]


def driver_earnings_payload(driver) -> dict:
    from apps.payments.ledger import ensure_wallet

    wallet = ensure_wallet(driver)
    gross = driver_gross_settled_earnings(driver)
    reserved = driver_payout_reserved(driver)
    settled_count = driver_settled_order_count(driver)
    source = 'wallet_ledger' if platform_payments_enabled() else 'offline_settlement'
    return {
        'completed_orders': settled_count,
        'settled_orders': settled_count,
        'total_earnings': float(gross),
        'available_balance': float(wallet.available),
        'held_balance': float(wallet.held),
        'reserved_payouts': float(reserved),
        'disputed_orders': driver_disputed_order_count(driver),
        'earnings_source': source,
        'platform_payments_enabled': platform_payments_enabled(),
    }
