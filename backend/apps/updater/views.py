from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Q
from django.utils import timezone
from datetime import datetime, timedelta
from apps.users.permissions import IsUpdater
from apps.orders.models import Order, OrderStatus, OrderLocationTrack
from apps.orders.serializers import OrderSerializer, OrderLocationTrackSerializer
from apps.payments.models import Payment
from .models import UpdateLog
from .serializers import (
    UpdateLogSerializer,
    UpdateStatusSerializer,
    UpdateLocationSerializer,
    UpdatePaymentSerializer,
    BulkUpdateSerializer
)


class UpdaterDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        today = timezone.now().date()
        
        pending_updates = Order.objects.exclude(
            status__code__in=['completed', 'cancelled']
        ).count()
        
        active_tracking = Order.objects.filter(
            status__code__in=['in_progress', 'in_transit'],
            current_location_lat__isnull=False,
            current_location_lng__isnull=False
        ).count()
        
        today_updates = UpdateLog.objects.filter(
            created_at__date=today,
            updater=request.user
        ).count()
        
        week_updates = UpdateLog.objects.filter(
            created_at__gte=today - timedelta(days=7),
            updater=request.user
        ).count()
        
        return Response({
            'pending_updates': pending_updates,
            'active_tracking': active_tracking,
            'today_updates': today_updates,
            'week_updates': week_updates,
        }, status=status.HTTP_200_OK)


class UpdaterPendingUpdatesView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        orders = Order.objects.exclude(
            status__code__in=['completed', 'cancelled']
        ).order_by('-created_at')[:50]
        
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterUpdateStatusView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        request=UpdateStatusSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request, pk):
        serializer = UpdateStatusSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk)
                old_status = order.status.code if order.status else None
                
                new_status = OrderStatus.objects.filter(
                    code=serializer.validated_data['status_code']
                ).first()
                
                if not new_status:
                    return Response({'error': 'Status not found'}, status=status.HTTP_400_BAD_REQUEST)
                
                order.status = new_status
                order.save()
                
                UpdateLog.objects.create(
                    updater=request.user,
                    order=order,
                    update_type='status',
                    old_value={'status': old_status},
                    new_value={'status': serializer.validated_data['status_code']},
                    description=serializer.validated_data.get('description', '')
                )
                
                from apps.orders.serializers import OrderSerializer
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK
                )
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UpdaterUpdateLocationView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        request=UpdateLocationSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request, pk):
        serializer = UpdateLocationSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk)
                old_location = {
                    'lat': float(order.current_location_lat) if order.current_location_lat else None,
                    'lng': float(order.current_location_lng) if order.current_location_lng else None,
                }
                
                order.current_location_lat = serializer.validated_data['lat']
                order.current_location_lng = serializer.validated_data['lng']
                order.save()
                
                from apps.orders.models import OrderLocationTrack
                OrderLocationTrack.objects.create(
                    order=order,
                    lat=serializer.validated_data['lat'],
                    lng=serializer.validated_data['lng']
                )
                
                UpdateLog.objects.create(
                    updater=request.user,
                    order=order,
                    update_type='location',
                    old_value=old_location,
                    new_value={
                        'lat': float(serializer.validated_data['lat']),
                        'lng': float(serializer.validated_data['lng']),
                    },
                    description=serializer.validated_data.get('description', '')
                )
                
                from apps.orders.serializers import OrderSerializer
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK
                )
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UpdaterUpdatePaymentView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        request=UpdatePaymentSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request, pk):
        serializer = UpdatePaymentSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk)
                payments = Payment.objects.filter(order=order)
                
                old_payment_status = payments.first().payment_status if payments.exists() else None
                
                if serializer.validated_data.get('payment_status'):
                    payments.update(payment_status=serializer.validated_data['payment_status'])
                
                UpdateLog.objects.create(
                    updater=request.user,
                    order=order,
                    update_type='payment',
                    old_value={'payment_status': old_payment_status},
                    new_value={'payment_status': serializer.validated_data.get('payment_status')},
                    description=serializer.validated_data.get('description', '')
                )
                
                from apps.orders.serializers import OrderSerializer
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK
                )
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UpdaterBulkUpdateView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        request=BulkUpdateSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request, pk):
        serializer = BulkUpdateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk)
                old_values = {}
                new_values = {}
                
                if serializer.validated_data.get('status_code'):
                    old_values['status'] = order.status.code if order.status else None
                    new_status = OrderStatus.objects.filter(
                        code=serializer.validated_data['status_code']
                    ).first()
                    if new_status:
                        order.status = new_status
                        new_values['status'] = serializer.validated_data['status_code']
                
                if serializer.validated_data.get('lat') and serializer.validated_data.get('lng'):
                    old_values['location'] = {
                        'lat': float(order.current_location_lat) if order.current_location_lat else None,
                        'lng': float(order.current_location_lng) if order.current_location_lng else None,
                    }
                    order.current_location_lat = serializer.validated_data['lat']
                    order.current_location_lng = serializer.validated_data['lng']
                    new_values['location'] = {
                        'lat': float(serializer.validated_data['lat']),
                        'lng': float(serializer.validated_data['lng']),
                    }
                    
                    from apps.orders.models import OrderLocationTrack
                    OrderLocationTrack.objects.create(
                        order=order,
                        lat=serializer.validated_data['lat'],
                        lng=serializer.validated_data['lng']
                    )
                
                if serializer.validated_data.get('payment_status'):
                    payments = Payment.objects.filter(order=order)
                    old_values['payment_status'] = payments.first().payment_status if payments.exists() else None
                    payments.update(payment_status=serializer.validated_data['payment_status'])
                    new_values['payment_status'] = serializer.validated_data['payment_status']
                
                order.save()
                
                UpdateLog.objects.create(
                    updater=request.user,
                    order=order,
                    update_type='other',
                    old_value=old_values,
                    new_value=new_values,
                    description=serializer.validated_data.get('description', '')
                )
                
                from apps.orders.serializers import OrderSerializer
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK
                )
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UpdaterTrackingView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            from apps.orders.models import OrderLocationTrack
            tracks = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')[:20]
            
            from apps.orders.serializers import OrderLocationTrackSerializer
            return Response({
                'order': OrderSerializer(order, context={'request': request}).data,
                'tracks': OrderLocationTrackSerializer(tracks, many=True).data,
            }, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class UpdaterActiveTrackingView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        orders = Order.objects.filter(
            status__code__in=['in_progress', 'in_transit'],
            current_location_lat__isnull=False,
            current_location_lng__isnull=False
        ).order_by('-updated_at')
        
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterLogsView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        parameters=[
            {'name': 'order_id', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
            {'name': 'update_type', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: UpdateLogSerializer(many=True)}
    )
    def get(self, request):
        queryset = UpdateLog.objects.filter(updater=request.user)
        
        order_id = request.query_params.get('order_id')
        if order_id:
            queryset = queryset.filter(order_id=order_id)
        
        update_type = request.query_params.get('update_type')
        if update_type:
            queryset = queryset.filter(update_type=update_type)
        
        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        
        date_to = request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        queryset = queryset.order_by('-created_at')
        
        serializer = UpdateLogSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterStatisticsView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        today = timezone.now().date()
        week_ago = today - timedelta(days=7)
        month_ago = today - timedelta(days=30)
        
        my_logs = UpdateLog.objects.filter(updater=request.user)
        
        total_updates = my_logs.count()
        today_updates = my_logs.filter(created_at__date=today).count()
        week_updates = my_logs.filter(created_at__gte=week_ago).count()
        month_updates = my_logs.filter(created_at__gte=month_ago).count()
        
        status_updates = my_logs.filter(update_type='status').count()
        location_updates = my_logs.filter(update_type='location').count()
        payment_updates = my_logs.filter(update_type='payment').count()
        
        daily_updates = []
        for i in range(7):
            date = today - timedelta(days=i)
            count = my_logs.filter(created_at__date=date).count()
            daily_updates.append({
                'date': date.strftime('%Y-%m-%d'),
                'count': count
            })
        daily_updates.reverse()
        
        monthly_updates = []
        for i in range(6):
            month_start = today.replace(day=1) - timedelta(days=30 * i)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            count = my_logs.filter(
                created_at__date__gte=month_start,
                created_at__date__lte=month_end
            ).count()
            monthly_updates.append({
                'month': month_start.strftime('%Y-%m'),
                'count': count
            })
        monthly_updates.reverse()
        
        return Response({
            'total_updates': total_updates,
            'today_updates': today_updates,
            'week_updates': week_updates,
            'month_updates': month_updates,
            'status_updates': status_updates,
            'location_updates': location_updates,
            'payment_updates': payment_updates,
            'daily_updates': daily_updates,
            'monthly_updates': monthly_updates,
        }, status=status.HTTP_200_OK)


class UpdaterOrderHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        parameters=[
            {'name': 'order_id', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: {'type': 'array'}}
    )
    def get(self, request):
        queryset = Order.objects.all()
        
        order_id = request.query_params.get('order_id')
        if order_id:
            queryset = queryset.filter(id=order_id)
        
        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        
        date_to = request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        queryset = queryset.order_by('-created_at')[:100]
        
        serializer = OrderSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterPaymentMonitoringView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        from apps.payments.models import Payment
        
        payments = Payment.objects.filter(
            order__isnull=False
        ).order_by('-created_at')[:50]
        
        from apps.payments.serializers import PaymentSerializer
        serializer = PaymentSerializer(payments, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterProblematicOrdersView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        problematic_orders = Order.objects.filter(
            Q(status__code__in=['stopped', 'rejected']) |
            Q(current_location_lat__isnull=True, status__code__in=['in_progress', 'in_transit'])
        ).order_by('-updated_at')
        
        serializer = OrderSerializer(problematic_orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class UpdaterLocationHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        parameters=[
            {'name': 'order_id', 'in': 'query', 'required': True, 'schema': {'type': 'integer'}},
        ],
        responses={200: OrderLocationTrackSerializer(many=True)}
    )
    def get(self, request):
        order_id = request.query_params.get('order_id')
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            order = Order.objects.get(pk=order_id)
            tracks = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')
            serializer = OrderLocationTrackSerializer(tracks, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class UpdaterAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        parameters=[
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
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
        
        my_logs = UpdateLog.objects.filter(
            updater=request.user,
            created_at__date__gte=date_from,
            created_at__date__lte=date_to
        )
        
        updates_by_type = {}
        for update_type, _ in UpdateLog._meta.get_field('update_type').choices:
            count = my_logs.filter(update_type=update_type).count()
            updates_by_type[update_type] = count
        
        orders_updated = my_logs.values('order_id').distinct().count()
        
        hourly_distribution = []
        for hour in range(24):
            count = my_logs.filter(created_at__hour=hour).count()
            hourly_distribution.append({'hour': hour, 'count': count})
        
        return Response({
            'updates_by_type': updates_by_type,
            'orders_updated': orders_updated,
            'hourly_distribution': hourly_distribution,
        }, status=status.HTTP_200_OK)


class UpdaterBulkOperationsView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        request={
            'type': 'object',
            'properties': {
                'order_ids': {'type': 'array', 'items': {'type': 'integer'}},
                'action': {'type': 'string', 'enum': ['update_status', 'update_location', 'update_payment']},
                'status_code': {'type': 'string'},
                'lat': {'type': 'number'},
                'lng': {'type': 'number'},
                'payment_status': {'type': 'string'},
                'description': {'type': 'string'}
            }
        },
        responses={200: {'type': 'object'}}
    )
    def post(self, request):
        order_ids = request.data.get('order_ids', [])
        action = request.data.get('action')
        
        if not order_ids:
            return Response({'error': 'order_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if action not in ['update_status', 'update_location', 'update_payment']:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        orders = Order.objects.filter(id__in=order_ids)
        results = {'success': [], 'failed': []}
        
        for order in orders:
            try:
                if action == 'update_status':
                    status_code = request.data.get('status_code')
                    if not status_code:
                        results['failed'].append({'order_id': order.id, 'error': 'status_code is required'})
                        continue
                    
                    new_status = OrderStatus.objects.filter(code=status_code).first()
                    if not new_status:
                        results['failed'].append({'order_id': order.id, 'error': 'Status not found'})
                        continue
                    
                    old_status = order.status.code if order.status else None
                    order.status = new_status
                    order.save()
                    
                    UpdateLog.objects.create(
                        updater=request.user,
                        order=order,
                        update_type='status',
                        old_value={'status': old_status},
                        new_value={'status': status_code},
                        description=request.data.get('description', '')
                    )
                    results['success'].append(order.id)
                
                elif action == 'update_location':
                    lat = request.data.get('lat')
                    lng = request.data.get('lng')
                    if not lat or not lng:
                        results['failed'].append({'order_id': order.id, 'error': 'lat and lng are required'})
                        continue
                    
                    old_location = {
                        'lat': float(order.current_location_lat) if order.current_location_lat else None,
                        'lng': float(order.current_location_lng) if order.current_location_lng else None,
                    }
                    order.current_location_lat = lat
                    order.current_location_lng = lng
                    order.save()
                    
                    OrderLocationTrack.objects.create(
                        order=order,
                        lat=lat,
                        lng=lng
                    )
                    
                    UpdateLog.objects.create(
                        updater=request.user,
                        order=order,
                        update_type='location',
                        old_value=old_location,
                        new_value={'lat': float(lat), 'lng': float(lng)},
                        description=request.data.get('description', '')
                    )
                    results['success'].append(order.id)
                
                elif action == 'update_payment':
                    payment_status = request.data.get('payment_status')
                    if not payment_status:
                        results['failed'].append({'order_id': order.id, 'error': 'payment_status is required'})
                        continue
                    
                    from apps.payments.models import Payment
                    payments = Payment.objects.filter(order=order)
                    old_payment_status = payments.first().payment_status if payments.exists() else None
                    payments.update(payment_status=payment_status)
                    
                    UpdateLog.objects.create(
                        updater=request.user,
                        order=order,
                        update_type='payment',
                        old_value={'payment_status': old_payment_status},
                        new_value={'payment_status': payment_status},
                        description=request.data.get('description', '')
                    )
                    results['success'].append(order.id)
            except Exception as e:
                results['failed'].append({'order_id': order.id, 'error': str(e)})
        
        return Response(results, status=status.HTTP_200_OK)


class UpdaterExportView(APIView):
    permission_classes = [IsAuthenticated, IsUpdater]

    @extend_schema(
        parameters=[
            {'name': 'format', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'enum': ['excel', 'csv']}},
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        format_type = request.query_params.get('format', 'excel')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        my_logs = UpdateLog.objects.filter(updater=request.user)
        
        if date_from:
            my_logs = my_logs.filter(created_at__date__gte=date_from)
        if date_to:
            my_logs = my_logs.filter(created_at__date__lte=date_to)
        
        export_data = []
        for log in my_logs:
            export_data.append({
                'id': log.id,
                'order_id': log.order.id,
                'update_type': log.update_type,
                'old_value': str(log.old_value) if log.old_value else '',
                'new_value': str(log.new_value) if log.new_value else '',
                'description': log.description or '',
                'created_at': log.created_at.strftime('%Y-%m-%d %H:%M:%S'),
            })
        
        if format_type == 'csv':
            import csv
            from django.http import HttpResponse
            
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="updater_logs_{timezone.now().date()}.csv"'
            
            writer = csv.DictWriter(response, fieldnames=export_data[0].keys() if export_data else [])
            writer.writeheader()
            writer.writerows(export_data)
            
            return response
        else:
            return Response({
                'data': export_data,
                'format': 'excel',
                'message': 'Excel export will be implemented with openpyxl library'
            }, status=status.HTTP_200_OK)
