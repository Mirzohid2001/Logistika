from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.utils import timezone
from datetime import datetime, timedelta

from apps.orders.financial import (
    client_gross_settled_spend,
    driver_gross_settled_earnings,
    earnings_by_completed_date,
    route_totals_from_settled_orders,
    settled_orders_q,
    spending_by_completed_date,
)
from apps.orders.models import Order


class AdvancedAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'type', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'enum': ['driver', 'client']}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        analytics_type = request.query_params.get('type', 'driver' if request.user.is_driver else 'client')

        if date_from:
            try:
                date_from = datetime.strptime(date_from, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_from format'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            date_from = timezone.now().date() - timedelta(days=30)

        if date_to:
            try:
                date_to = datetime.strptime(date_to, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_to format'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            date_to = timezone.now().date()

        if analytics_type == 'driver' and request.user.is_driver:
            return self._get_driver_analytics(request.user, date_from, date_to)
        elif analytics_type == 'client' and request.user.is_client:
            return self._get_client_analytics(request.user, date_from, date_to)
        else:
            return Response({'error': 'Invalid analytics type or user role'}, status=status.HTTP_400_BAD_REQUEST)

    def _get_driver_analytics(self, user, date_from, date_to):
        orders = Order.objects.filter(
            driver=user,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        )

        completed_orders = orders.filter(status__code='completed')
        settled_orders = completed_orders.filter(settled_orders_q())
        total_earnings = driver_gross_settled_earnings(user, date_from=date_from, date_to=date_to)
        settled_count = settled_orders.count()
        daily_earnings = earnings_by_completed_date(user, date_from, date_to)

        hourly_distribution = []
        for hour in range(24):
            count = completed_orders.filter(created_at__hour=hour).count()
            hourly_distribution.append({
                'hour': hour,
                'count': count
            })

        routes = route_totals_from_settled_orders(
            settled_orders,
            amount_key='total_earnings',
        )

        return Response({
            'earnings_analysis': {
                'total_earnings': float(total_earnings),
                'total_payments': settled_count,
                'average_per_order': float(total_earnings) / max(settled_count, 1),
                'daily_earnings': daily_earnings
            },
            'best_times': {
                'hourly_distribution': hourly_distribution,
                'best_hour': max(hourly_distribution, key=lambda x: x['count'])['hour'] if hourly_distribution else None
            },
            'best_routes': routes
        }, status=status.HTTP_200_OK)

    def _get_client_analytics(self, user, date_from, date_to):
        orders = Order.objects.filter(
            client=user,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        )

        completed_orders = orders.filter(status__code='completed')
        settled_orders = completed_orders.filter(settled_orders_q())
        total_expenses = client_gross_settled_spend(user, date_from=date_from, date_to=date_to)
        settled_count = settled_orders.count()
        daily_expenses = spending_by_completed_date(user, date_from, date_to)

        hourly_distribution = []
        for hour in range(24):
            count = completed_orders.filter(created_at__hour=hour).count()
            hourly_distribution.append({
                'hour': hour,
                'count': count
            })

        routes = route_totals_from_settled_orders(
            settled_orders,
            amount_key='total_cost',
        )

        return Response({
            'expenses_analysis': {
                'total_expenses': float(total_expenses),
                'total_payments': settled_count,
                'average_per_order': float(total_expenses) / max(settled_count, 1),
                'daily_expenses': daily_expenses
            },
            'best_times': {
                'hourly_distribution': hourly_distribution,
                'best_hour': max(hourly_distribution, key=lambda x: x['count'])['hour'] if hourly_distribution else None
            },
            'best_routes': routes
        }, status=status.HTTP_200_OK)
