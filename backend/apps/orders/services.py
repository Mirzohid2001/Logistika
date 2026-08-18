from decimal import Decimal, InvalidOperation

from apps.orders.models import Order

TERMINAL_ORDER_STATUS_CODES = frozenset({'completed', 'cancelled', 'rejected', 'stopped'})
TRACKING_ELIGIBLE_STATUS_CODES = frozenset({'approved_by_client', 'in_progress', 'in_transit'})
ROUTE_MUTABLE_STATUS_CODES = frozenset({'approved_by_client', 'in_progress'})
STOP_COMPLETABLE_STATUS_CODES = frozenset({'in_progress', 'in_transit'})
TRIP_LOCKED_STATUS_CODES = frozenset({'in_progress', 'in_transit'})


def order_accepts_location_updates(status_code: str) -> bool:
    return status_code in TRACKING_ELIGIBLE_STATUS_CODES


def order_allows_route_mutations(status_code: str) -> bool:
    return status_code in ROUTE_MUTABLE_STATUS_CODES


def order_allows_stop_completion(status_code: str) -> bool:
    return status_code in STOP_COMPLETABLE_STATUS_CODES


def order_allows_driver_assignment(status_code: str) -> bool:
    return status_code not in TRIP_LOCKED_STATUS_CODES and status_code not in TERMINAL_ORDER_STATUS_CODES


def orders_eligible_for_tracking():
    return Order.objects.filter(status__code__in=TRACKING_ELIGIBLE_STATUS_CODES)


def decimal_from_amount(raw) -> Decimal | None:
    if raw is None:
        return None
    try:
        return Decimal(str(raw))
    except (InvalidOperation, TypeError, ValueError):
        return None


def resolve_agreed_amount(*, bid=None, advertisement=None) -> Decimal | None:
    if bid is not None:
        return decimal_from_amount(bid.get_current_amount())
    if advertisement is not None and advertisement.proposed_cost is not None:
        return Decimal(str(advertisement.proposed_cost))
    return None


def order_pricing_kwargs(*, bid=None, advertisement=None) -> dict:
    amount = resolve_agreed_amount(bid=bid, advertisement=advertisement)
    kwargs = {}
    if bid is not None:
        kwargs['source_bid'] = bid
    if amount is not None:
        kwargs['agreed_amount'] = amount
    return kwargs


def advertisement_has_active_order(advertisement_id: int) -> bool:
    return Order.objects.filter(
        advertisement_id=advertisement_id,
    ).exclude(
        status__code__in=TERMINAL_ORDER_STATUS_CODES,
    ).exists()


def driver_has_active_order(driver_id: int) -> bool:
    return Order.objects.filter(
        driver_id=driver_id,
    ).exclude(
        status__code__in=TERMINAL_ORDER_STATUS_CODES,
    ).exists()
