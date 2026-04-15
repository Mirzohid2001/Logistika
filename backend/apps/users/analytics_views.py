from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Sum, Count, Avg, Q, F
from django.utils import timezone
from datetime import datetime, timedelta
from apps.orders.models import Order
from apps.payments.models import Payment
from apps.advertisements.models import Advertisement


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
        
        earnings_data = Payment.objects.filter(
            user=user,
            payment_status='completed',
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        ).aggregate(
            total_earnings=Sum('amount'),
            count=Count('id')
        )

        daily_earnings = []
        for i in range((date_to - date_from).days + 1):
            date = date_from + timedelta(days=i)
            day_earnings = Payment.objects.filter(
                user=user,
                payment_status='completed',
                created_at__date=date
            ).aggregate(total=Sum('amount'))['total'] or 0
            daily_earnings.append({
                'date': date.strftime('%Y-%m-%d'),
                'earnings': float(day_earnings)
            })

        hourly_distribution = []
        for hour in range(24):
            count = completed_orders.filter(created_at__hour=hour).count()
            hourly_distribution.append({
                'hour': hour,
                'count': count
            })

        route_stats = completed_orders.values(
            'advertisement__departure_city__name_uz',
            'advertisement__destination_city__name_uz'
        ).annotate(
            count=Count('id'),
            total_earnings=Sum('advertisement__proposed_cost')
        ).order_by('-count')[:10]

        routes = []
        for route in route_stats:
            routes.append({
                'from': route['advertisement__departure_city__name_uz'],
                'to': route['advertisement__destination_city__name_uz'],
                'count': route['count'],
                'total_earnings': float(route['total_earnings'] or 0)
            })

        return Response({
            'earnings_analysis': {
                'total_earnings': float(earnings_data['total_earnings'] or 0),
                'total_payments': earnings_data['count'] or 0,
                'average_per_order': float(earnings_data['total_earnings'] or 0) / max(completed_orders.count(), 1),
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

        expenses_data = Payment.objects.filter(
            order__client=user,
            payment_status='completed',
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        ).aggregate(
            total_expenses=Sum('amount'),
            count=Count('id')
        )

        daily_expenses = []
        for i in range((date_to - date_from).days + 1):
            date = date_from + timedelta(days=i)
            day_expenses = Payment.objects.filter(
                order__client=user,
                payment_status='completed',
                created_at__date=date
            ).aggregate(total=Sum('amount'))['total'] or 0
            daily_expenses.append({
                'date': date.strftime('%Y-%m-%d'),
                'expenses': float(day_expenses)
            })

        hourly_distribution = []
        for hour in range(24):
            count = completed_orders.filter(created_at__hour=hour).count()
            hourly_distribution.append({
                'hour': hour,
                'count': count
            })

        route_stats = completed_orders.values(
            'advertisement__departure_city__name_uz',
            'advertisement__destination_city__name_uz'
        ).annotate(
            count=Count('id'),
            total_cost=Sum('advertisement__proposed_cost')
        ).order_by('-count')[:10]

        routes = []
        for route in route_stats:
            routes.append({
                'from': route['advertisement__departure_city__name_uz'],
                'to': route['advertisement__destination_city__name_uz'],
                'count': route['count'],
                'total_cost': float(route['total_cost'] or 0)
            })

        return Response({
            'expenses_analysis': {
                'total_expenses': float(expenses_data['total_expenses'] or 0),
                'total_payments': expenses_data['count'] or 0,
                'average_per_order': float(expenses_data['total_expenses'] or 0) / max(completed_orders.count(), 1),
                'daily_expenses': daily_expenses
            },
            'best_times': {
                'hourly_distribution': hourly_distribution,
                'best_hour': max(hourly_distribution, key=lambda x: x['count'])['hour'] if hourly_distribution else None
            },
            'best_routes': routes
        }, status=status.HTTP_200_OK)
