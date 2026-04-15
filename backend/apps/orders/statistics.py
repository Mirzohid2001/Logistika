from django.db.models import Sum, Count, Q, Avg
from django.utils import timezone
from datetime import datetime, timedelta
from apps.orders.models import Order, OrderStatus
from apps.payments.models import Payment


class DriverStatisticsService:
    @staticmethod
    def get_driver_statistics(driver, date_from=None, date_to=None):
        today = timezone.now().date()
        range_end = date_to or today
        range_start = date_from or (range_end - timedelta(days=6))
        if range_start > range_end:
            range_start, range_end = range_end, range_start

        orders = Order.objects.filter(
            driver=driver,
            created_at__date__gte=range_start,
            created_at__date__lte=range_end
        )
        completed_status = OrderStatus.objects.filter(code='completed').first()
        pending_status = OrderStatus.objects.filter(code='pending').first()
        in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
        in_transit_status = OrderStatus.objects.filter(code='in_transit').first()
        
        completed_orders = orders.filter(status=completed_status).count() if completed_status else 0
        pending_orders = orders.filter(status=pending_status).count() if pending_status else 0
        in_progress_orders = orders.filter(
            Q(status=in_progress_status) | Q(status=in_transit_status)
        ).count() if (in_progress_status or in_transit_status) else 0
        
        driver_orders = orders.filter(status=completed_status) if completed_status else Order.objects.none()
        
        payments_filter = Q(
            order__driver=driver,
            payment_status='completed',
            paid_at__date__gte=range_start,
            paid_at__date__lte=range_end
        )
        
        total_earnings = Payment.objects.filter(payments_filter).exclude(
            refunded_at__isnull=False
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        completed_orders_list = orders.filter(status=completed_status) if completed_status else Order.objects.none()
        avg_order_amount = completed_orders_list.aggregate(
            avg=Avg('advertisement__proposed_cost')
        )['avg'] or 0
        
        week_ago = range_end - timedelta(days=7)
        month_ago = range_end - timedelta(days=30)
        
        earnings_today = Payment.objects.filter(
            order__driver=driver,
            payment_status='completed',
            paid_at__date=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        earnings_week = Payment.objects.filter(
            order__driver=driver,
            payment_status='completed',
            paid_at__date__gte=max(week_ago, range_start),
            paid_at__date__lte=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        earnings_month = Payment.objects.filter(
            order__driver=driver,
            payment_status='completed',
            paid_at__date__gte=max(month_ago, range_start),
            paid_at__date__lte=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        daily_earnings = []
        days_span = (range_end - range_start).days + 1
        for i in range(days_span):
            date = range_end - timedelta(days=i)
            earnings = Payment.objects.filter(
                order__driver=driver,
                payment_status='completed',
                paid_at__date=date
            ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
            daily_earnings.append({
                'date': date.isoformat(),
                'earnings': float(earnings)
            })
        daily_earnings.reverse()
        
        monthly_earnings = []
        for i in range(6):
            month_start = (timezone.now() - timedelta(days=30 * (i + 1))).replace(day=1)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            earnings = Payment.objects.filter(
                order__driver=driver,
                payment_status='completed',
                paid_at__gte=month_start,
                paid_at__lte=month_end
            ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
            monthly_earnings.append({
                'month': month_start.strftime('%Y-%m'),
                'earnings': float(earnings)
            })
        monthly_earnings.reverse()
        
        return {
            'date_from': range_start.isoformat(),
            'date_to': range_end.isoformat(),
            'total_earnings': float(total_earnings),
            'completed_orders': completed_orders,
            'pending_orders': pending_orders,
            'in_progress_orders': in_progress_orders,
            'avg_order_amount': float(avg_order_amount),
            'earnings_today': float(earnings_today),
            'earnings_week': float(earnings_week),
            'earnings_month': float(earnings_month),
            'daily_earnings': daily_earnings,
            'monthly_earnings': monthly_earnings
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
            created_at__date__lte=range_end
        )
        completed_status = OrderStatus.objects.filter(code='completed').first()
        pending_status = OrderStatus.objects.filter(code='pending').first()
        in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
        
        total_orders = orders.count()
        completed_orders = orders.filter(status=completed_status).count() if completed_status else 0
        pending_orders = orders.filter(status=pending_status).count() if pending_status else 0
        active_orders = orders.filter(
            Q(status=in_progress_status) | Q(status__code='in_transit')
        ).count() if in_progress_status else 0
        
        payments_filter = Q(
            user=client,
            payment_status='completed',
            paid_at__date__gte=range_start,
            paid_at__date__lte=range_end
        )
        
        total_spent = Payment.objects.filter(payments_filter).exclude(
            refunded_at__isnull=False
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        completed_orders_list = orders.filter(status=completed_status) if completed_status else Order.objects.none()
        avg_order_cost = completed_orders_list.aggregate(
            avg=Avg('advertisement__proposed_cost')
        )['avg'] or 0
        
        week_ago = range_end - timedelta(days=7)
        month_ago = range_end - timedelta(days=30)
        
        spent_today = Payment.objects.filter(
            user=client,
            payment_status='completed',
            paid_at__date=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        spent_week = Payment.objects.filter(
            user=client,
            payment_status='completed',
            paid_at__date__gte=max(week_ago, range_start),
            paid_at__date__lte=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        spent_month = Payment.objects.filter(
            user=client,
            payment_status='completed',
            paid_at__date__gte=max(month_ago, range_start),
            paid_at__date__lte=range_end
        ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
        
        daily_spending = []
        days_span = (range_end - range_start).days + 1
        for i in range(days_span):
            date = range_end - timedelta(days=i)
            spending = Payment.objects.filter(
                user=client,
                payment_status='completed',
                paid_at__date=date
            ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
            daily_spending.append({
                'date': date.isoformat(),
                'spending': float(spending)
            })
        daily_spending.reverse()
        
        monthly_spending = []
        for i in range(6):
            month_start = (timezone.now() - timedelta(days=30 * (i + 1))).replace(day=1)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            spending = Payment.objects.filter(
                user=client,
                payment_status='completed',
                paid_at__gte=month_start,
                paid_at__lte=month_end
            ).exclude(refunded_at__isnull=False).aggregate(total=Sum('amount'))['total'] or 0
            monthly_spending.append({
                'month': month_start.strftime('%Y-%m'),
                'spending': float(spending)
            })
        monthly_spending.reverse()
        
        return {
            'date_from': range_start.isoformat(),
            'date_to': range_end.isoformat(),
            'total_spent': float(total_spent),
            'total_orders': total_orders,
            'completed_orders': completed_orders,
            'pending_orders': pending_orders,
            'active_orders': active_orders,
            'avg_order_cost': float(avg_order_cost),
            'spent_today': float(spent_today),
            'spent_week': float(spent_week),
            'spent_month': float(spent_month),
            'daily_spending': daily_spending,
            'monthly_spending': monthly_spending
        }
