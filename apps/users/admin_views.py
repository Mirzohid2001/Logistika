from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.db.models import Sum, Count, Q, Prefetch
from django.utils import timezone
from datetime import datetime, timedelta
from drf_spectacular.utils import extend_schema
from .permissions import IsAdmin
from .models import User
from apps.orders.models import Order, OrderStatus
from apps.payments.models import Payment
import csv
from io import StringIO


class DriverEarningsStatisticsView(APIView):
    permission_classes = [IsAuthenticated, IsAdmin]

    @extend_schema(
        parameters=[
            {
                'name': 'date_from',
                'in': 'query',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Boshlanish sanasi (YYYY-MM-DD)'
            },
            {
                'name': 'date_to',
                'in': 'query',
                'required': False,
                'schema': {'type': 'string', 'format': 'date'},
                'description': 'Tugash sanasi (YYYY-MM-DD)'
            },
            {
                'name': 'driver_id',
                'in': 'query',
                'required': False,
                'schema': {'type': 'integer'},
                'description': 'Haydovchi ID'
            },
            {
                'name': 'export',
                'in': 'query',
                'required': False,
                'schema': {'type': 'string', 'enum': ['csv']},
                'description': 'Export format (csv)'
            }
        ],
        responses={
            200: {
                'type': 'object',
                'properties': {
                    'total_drivers': {'type': 'integer'},
                    'total_earnings': {'type': 'number'},
                    'total_completed_orders': {'type': 'integer'},
                    'drivers': {
                        'type': 'array',
                        'items': {
                            'type': 'object',
                            'properties': {
                                'driver_id': {'type': 'integer'},
                                'driver_name': {'type': 'string'},
                                'driver_phone': {'type': 'string'},
                                'completed_orders': {'type': 'integer'},
                                'total_earnings': {'type': 'number'},
                                'pending_orders': {'type': 'integer'},
                                'in_progress_orders': {'type': 'integer'}
                            }
                        }
                    }
                }
            }
        }
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        driver_id = request.query_params.get('driver_id')
        export_format = request.query_params.get('export')

        drivers_queryset = User.objects.filter(is_driver=True)

        if driver_id:
            drivers_queryset = drivers_queryset.filter(id=driver_id)

        orders_date_filter = Q()
        payments_date_filter = Q()

        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
                date_from_datetime = timezone.make_aware(datetime.combine(date_from_obj, datetime.min.time()))
                orders_date_filter &= Q(created_at__gte=date_from_datetime)
                payments_date_filter &= Q(created_at__gte=date_from_datetime)
            except ValueError:
                return Response({'error': 'Invalid date_from format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
                date_to_datetime = timezone.make_aware(datetime.combine(date_to_obj, datetime.max.time()))
                orders_date_filter &= Q(created_at__lte=date_to_datetime)
                payments_date_filter &= Q(created_at__lte=date_to_datetime)
            except ValueError:
                return Response({'error': 'Invalid date_to format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)

        completed_status = OrderStatus.objects.filter(code='completed').first()
        in_progress_status = OrderStatus.objects.filter(code='in_progress').first()
        pending_status = OrderStatus.objects.filter(code='pending').first()

        drivers_data = []
        total_earnings = 0
        total_completed_orders = 0

        for driver in drivers_queryset:
            orders_filter = Q(driver=driver)
            payments_filter = Q(user=driver, payment_status='completed')

            if orders_date_filter:
                orders_filter &= orders_date_filter
            if payments_date_filter:
                payments_filter &= payments_date_filter

            completed_orders = Order.objects.filter(
                orders_filter,
                status=completed_status
            ).count() if completed_status else 0

            pending_orders = Order.objects.filter(
                orders_filter,
                status=pending_status
            ).count() if pending_status else 0

            in_progress_orders = Order.objects.filter(
                orders_filter,
                status=in_progress_status
            ).count() if in_progress_status else 0

            earnings = Payment.objects.filter(payments_filter).aggregate(
                total=Sum('amount')
            )['total'] or 0

            total_earnings += float(earnings)
            total_completed_orders += completed_orders

            drivers_data.append({
                'driver_id': driver.id,
                'driver_name': f"{driver.first_name} {driver.last_name}",
                'driver_phone': driver.phone,
                'completed_orders': completed_orders,
                'total_earnings': float(earnings),
                'pending_orders': pending_orders,
                'in_progress_orders': in_progress_orders
            })

        response_data = {
            'total_drivers': len(drivers_data),
            'total_earnings': total_earnings,
            'total_completed_orders': total_completed_orders,
            'drivers': drivers_data
        }

        if export_format == 'csv':
            return self._export_to_csv(drivers_data)

        return Response(response_data, status=status.HTTP_200_OK)

    def _export_to_csv(self, drivers_data):
        output = StringIO()
        writer = csv.writer(output)
        
        writer.writerow([
            'Driver ID',
            'Driver Name',
            'Phone',
            'Completed Orders',
            'Total Earnings',
            'Pending Orders',
            'In Progress Orders'
        ])
        
        for driver in drivers_data:
            writer.writerow([
                driver['driver_id'],
                driver['driver_name'],
                driver['driver_phone'],
                driver['completed_orders'],
                driver['total_earnings'],
                driver['pending_orders'],
                driver['in_progress_orders']
            ])
        
        output.seek(0)
        response = Response(output.getvalue(), content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="driver_earnings_statistics.csv"'
        return response

