from datetime import timedelta

from django.db.models import Q
from django.utils import timezone

from apps.orders.financial import (
    average_settled_order_amount,
    client_gross_settled_spend,
    client_settled_orders_qs,
    count_positive_amount_orders,
    driver_gross_settled_earnings,
    driver_settled_orders_qs,
    earnings_by_completed_date,
    monthly_settled_totals_for_client,
    monthly_settled_totals_for_driver,
    spending_by_completed_date,
)
from apps.orders.models import Order, OrderStatus


class DriverStatisticsService:
    @staticmethod
    def get_driver_statistics(driver, date_from=None, date_to=None):
        today = timezone.now().date()
        range_end = date_to or today
        range_start = date_from or (range_end - timedelta(days=6))
        if range_start > range_end:
            range_start, range_end = range_end, range_start

        # Activity counts use created_at; completed/settled metrics use completed_at.
        orders = Order.objects.filter(
            driver=driver,
            created_at__date__gte=range_start,
            created_at__date__lte=range_end,
        )
        completed_status = OrderStatus.objects.filter(code='completed').first()
        pending_status = OrderStatus.objects.filter(code='pending').first()
        in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
        in_transit_status = OrderStatus.objects.filter(code='in_transit').first()

        completed_orders = (
            Order.objects.filter(
                driver=driver,
                status=completed_status,
                completed_at__date__gte=range_start,
                completed_at__date__lte=range_end,
            ).count()
            if completed_status
            else 0
        )
        pending_orders = orders.filter(status=pending_status).count() if pending_status else 0
        in_progress_orders = orders.filter(
            Q(status=in_progress_status) | Q(status=in_transit_status)
        ).count() if (in_progress_status or in_transit_status) else 0

        settled_orders = driver_settled_orders_qs(driver, date_from=range_start, date_to=range_end)
        settled_orders_count = count_positive_amount_orders(settled_orders)
        total_earnings = driver_gross_settled_earnings(driver, date_from=range_start, date_to=range_end)
        avg_order_amount = average_settled_order_amount(settled_orders)

        earnings_today = driver_gross_settled_earnings(driver, date_from=range_end, date_to=range_end)
        week_ago = max(range_start, range_end - timedelta(days=7))
        earnings_week = driver_gross_settled_earnings(driver, date_from=week_ago, date_to=range_end)
        month_ago = max(range_start, range_end - timedelta(days=30))
        earnings_month = driver_gross_settled_earnings(driver, date_from=month_ago, date_to=range_end)

        daily_earnings = earnings_by_completed_date(driver, range_start, range_end)
        monthly_earnings = monthly_settled_totals_for_driver(driver)

        return {
            'date_from': range_start.isoformat(),
            'date_to': range_end.isoformat(),
            'total_earnings': float(total_earnings),
            'completed_orders': completed_orders,
            'settled_orders': settled_orders_count,
            'pending_orders': pending_orders,
            'in_progress_orders': in_progress_orders,
            'avg_order_amount': float(avg_order_amount),
            'earnings_today': float(earnings_today),
            'earnings_week': float(earnings_week),
            'earnings_month': float(earnings_month),
            'daily_earnings': daily_earnings,
            'monthly_earnings': monthly_earnings,
        }


class ClientStatisticsService:
    @staticmethod
    def get_client_statistics(client, date_from=None, date_to=None):
        today = timezone.now().date()
        range_end = date_to or today
        range_start = date_from or (range_end - timedelta(days=6))
        if range_start > range_end:
            range_start, range_end = range_end, range_start

        orders = Order.objects.filter(
            client=client,
            created_at__date__gte=range_start,
            created_at__date__lte=range_end,
        )
        completed_status = OrderStatus.objects.filter(code='completed').first()
        pending_status = OrderStatus.objects.filter(code='pending').first()
        in_progress_status = OrderStatus.objects.filter(code='in_progress').first()

        total_orders = orders.count()
        completed_orders = (
            Order.objects.filter(
                client=client,
                status=completed_status,
                completed_at__date__gte=range_start,
                completed_at__date__lte=range_end,
            ).count()
            if completed_status
            else 0
        )
        pending_orders = orders.filter(status=pending_status).count() if pending_status else 0
        active_orders = orders.filter(
            Q(status=in_progress_status) | Q(status__code='in_transit')
        ).count() if in_progress_status else 0

        settled_orders = client_settled_orders_qs(client, date_from=range_start, date_to=range_end)
        settled_orders_count = count_positive_amount_orders(settled_orders)
        total_spent = client_gross_settled_spend(client, date_from=range_start, date_to=range_end)
        avg_order_cost = average_settled_order_amount(settled_orders)

        spent_today = client_gross_settled_spend(client, date_from=range_end, date_to=range_end)
        week_ago = max(range_start, range_end - timedelta(days=7))
        spent_week = client_gross_settled_spend(client, date_from=week_ago, date_to=range_end)
        month_ago = max(range_start, range_end - timedelta(days=30))
        spent_month = client_gross_settled_spend(client, date_from=month_ago, date_to=range_end)

        daily_spending = spending_by_completed_date(client, range_start, range_end)
        monthly_spending = monthly_settled_totals_for_client(client)

        return {
            'date_from': range_start.isoformat(),
            'date_to': range_end.isoformat(),
            'total_spent': float(total_spent),
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'settled_orders': settled_orders_count,
            'pending_orders': pending_orders,
            'active_orders': active_orders,
            'avg_order_cost': float(avg_order_cost),
            'spent_today': float(spent_today),
            'spent_week': float(spent_week),
            'spent_month': float(spent_month),
            'daily_spending': daily_spending,
            'monthly_spending': monthly_spending,
        }
