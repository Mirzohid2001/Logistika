from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Q, Count, Sum, Avg
from django.utils import timezone
from datetime import datetime, timedelta
from django.core.cache import cache
from apps.users.permissions import IsDispatcher
from apps.orders.models import Order, OrderStatus, OrderLocationTrack
from apps.users.models import User, DriverDocument
from .models import DispatcherAssignment, DispatcherNote, DispatcherExceptionAction
from .serializers import (
    DispatcherAssignmentSerializer,
    DispatcherAssignmentCreateSerializer,
    DispatcherAssignmentReassignSerializer,
    DispatcherNoteSerializer,
    DispatcherExceptionAcknowledgeSerializer,
    DispatcherExceptionSnoozeSerializer,
    DispatcherSuggestionAssignSerializer,
)
from apps.orders.services import order_allows_driver_assignment
from apps.orders.serializers import OrderSerializer
from apps.common.openapi import EmptySerializer, NoteRequestSerializer, DispatcherBulkRequestSerializer
from apps.vehicles.serializers import VehicleSerializer
from apps.notifications.services import create_notification
from apps.users.document_expiry import expired_documents_error_payload


def _reject_if_trip_locked(order: Order):
    if not order_allows_driver_assignment(order.status.code):
        return Response(
            {'error': "Safar boshlangan buyurtmaga haydovchini o'zgartirib bo'lmaydi."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


def _reject_if_expired_documents(driver: User):
    from apps.users.document_expiry import document_expiry_forbidden_response
    return document_expiry_forbidden_response(driver)


def _apply_assigned_driver(order: Order, driver: User) -> None:
    order.driver = driver
    if order.status.code != 'approved_by_client':
        pending_status = OrderStatus.objects.filter(code='pending').first()
        if pending_status:
            order.status = pending_status
    order.save()


def _driver_presence(last_seen_at):
    if not last_seen_at:
        return {'status': 'offline', 'stale_level': 'offline', 'age_seconds': None}
    age_seconds = max(0, int((timezone.now() - last_seen_at).total_seconds()))
    if age_seconds <= 30:
        level = 'online'
    elif age_seconds <= 60:
        level = 'warning'
    elif age_seconds <= 180:
        level = 'stale'
    else:
        level = 'offline'
    return {
        'status': 'online' if level in ['online', 'warning'] else 'offline',
        'stale_level': level,
        'age_seconds': age_seconds,
    }


class DispatcherDashboardView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        today = timezone.now().date()
        
        total_orders = Order.objects.count()
        active_orders = Order.objects.exclude(
            status__code__in=['completed', 'cancelled', 'rejected']
        ).count()
        pending_orders = Order.objects.filter(
            status__code='pending'
        ).count()
        problematic_orders = Order.objects.filter(
            status__code__in=['stopped', 'rejected']
        ).count()
        
        today_assignments = DispatcherAssignment.objects.filter(
            assigned_at__date=today,
            dispatcher=request.user
        ).count()
        
        my_assignments = DispatcherAssignment.objects.filter(
            dispatcher=request.user,
            status__in=['assigned', 'reassigned']
        ).count()
        
        return Response({
            'total_orders': total_orders,
            'active_orders': active_orders,
            'pending_orders': pending_orders,
            'problematic_orders': problematic_orders,
            'today_assignments': today_assignments,
            'my_assignments': my_assignments,
        }, status=status.HTTP_200_OK)


class DispatcherOrdersView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        parameters=[
            {'name': 'status', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
            {'name': 'search', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: OrderSerializer(many=True)}
    )
    def get(self, request):
        queryset = Order.objects.all()
        
        status_filter = request.query_params.get('status')
        if status_filter:
            if status_filter == 'active':
                queryset = queryset.exclude(status__code__in=['completed', 'cancelled', 'rejected'])
            elif status_filter == 'pending':
                queryset = queryset.filter(status__code='pending')
            elif status_filter == 'problematic':
                queryset = queryset.filter(status__code__in=['stopped', 'rejected'])
            else:
                queryset = queryset.filter(status__code=status_filter)
        
        search = request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(id__icontains=search) |
                Q(advertisement__title_ru__icontains=search) |
                Q(client__phone__icontains=search) |
                Q(driver__phone__icontains=search)
            )
        
        date_from = request.query_params.get('date_from')
        if date_from:
            queryset = queryset.filter(created_at__gte=date_from)
        
        date_to = request.query_params.get('date_to')
        if date_to:
            queryset = queryset.filter(created_at__lte=date_to)
        
        queryset = queryset.order_by('-created_at')
        
        serializer = OrderSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DispatcherOrderDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: OrderSerializer})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            serializer = OrderSerializer(order, context={'request': request})
            
            assignments = DispatcherAssignment.objects.filter(order=order, dispatcher=request.user)
            notes = DispatcherNote.objects.filter(order=order, dispatcher=request.user)
            
            return Response({
                **serializer.data,
                'assignments': DispatcherAssignmentSerializer(assignments, many=True).data,
                'notes': DispatcherNoteSerializer(notes, many=True).data,
            }, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherAssignView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherAssignmentCreateSerializer,
        responses={201: DispatcherAssignmentSerializer}
    )
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        
        serializer = DispatcherAssignmentCreateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                driver = User.objects.get(pk=serializer.validated_data['driver_id'], is_driver=True)
                
                if not driver.is_verified:
                    return Response({
                        'error': 'Driver is not verified. Only verified drivers can be assigned.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                expired = _reject_if_expired_documents(driver)
                if expired:
                    return expired

                blocked = _reject_if_trip_locked(order)
                if blocked:
                    return blocked
                
                assignment = DispatcherAssignment.objects.create(
                    dispatcher=request.user,
                    order=order,
                    assigned_driver=driver,
                    notes=serializer.validated_data.get('notes', '')
                )
                _apply_assigned_driver(order, driver)
                
                return Response(
                    DispatcherAssignmentSerializer(assignment).data,
                    status=status.HTTP_201_CREATED
                )
            except User.DoesNotExist:
                return Response({'error': 'Driver not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DispatcherReassignView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherAssignmentReassignSerializer,
        responses={200: DispatcherAssignmentSerializer}
    )
    def post(self, request, pk):
        serializer = DispatcherAssignmentReassignSerializer(data=request.data)
        if serializer.is_valid():
            try:
                assignment = DispatcherAssignment.objects.get(pk=pk, dispatcher=request.user)
                driver = User.objects.get(pk=serializer.validated_data['driver_id'], is_driver=True)
                
                if not driver.is_verified:
                    return Response({
                        'error': 'Driver is not verified. Only verified drivers can be assigned.'
                    }, status=status.HTTP_400_BAD_REQUEST)

                expired = _reject_if_expired_documents(driver)
                if expired:
                    return expired

                blocked = _reject_if_trip_locked(assignment.order)
                if blocked:
                    return blocked
                
                assignment.assigned_driver = driver
                assignment.reassigned_at = timezone.now()
                assignment.status = 'reassigned'
                if serializer.validated_data.get('notes'):
                    assignment.notes = serializer.validated_data['notes']
                assignment.save()
                assignment.order.driver = driver
                assignment.order.save(update_fields=['driver', 'updated_at'])
                
                return Response(
                    DispatcherAssignmentSerializer(assignment).data,
                    status=status.HTTP_200_OK
                )
            except DispatcherAssignment.DoesNotExist:
                return Response({'error': 'Assignment not found'}, status=status.HTTP_404_NOT_FOUND)
            except User.DoesNotExist:
                return Response({'error': 'Driver not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DispatcherCancelOrderView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            cancelled_status = OrderStatus.objects.filter(code='cancelled').first()
            
            if cancelled_status:
                from apps.payments.escrow import settle_order_cancellation
                settle_order_cancellation(order, actor='dispatcher')
                order.status = cancelled_status
                order.save()
            
            assignment = DispatcherAssignment.objects.filter(
                order=order,
                dispatcher=request.user,
                status__in=['assigned', 'reassigned']
            ).first()
            
            if assignment:
                assignment.status = 'cancelled'
                assignment.save()
            
            return Response(
                OrderSerializer(order, context={'request': request}).data,
                status=status.HTTP_200_OK
            )
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherAddNoteView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=NoteRequestSerializer,
        responses={201: DispatcherNoteSerializer}
    )
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            note_text = request.data.get('note', '')
            
            if not note_text:
                return Response({'error': 'Note is required'}, status=status.HTTP_400_BAD_REQUEST)
            
            note = DispatcherNote.objects.create(
                dispatcher=request.user,
                order=order,
                note=note_text
            )
            
            return Response(
                DispatcherNoteSerializer(note).data,
                status=status.HTTP_201_CREATED
            )
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherDriversView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        drivers = User.objects.filter(is_driver=True, is_verified=True)
        from apps.users.serializers import UserSerializer
        serializer = UserSerializer(drivers, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DispatcherClientsView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        clients = User.objects.filter(is_client=True)
        from apps.users.serializers import UserSerializer
        serializer = UserSerializer(clients, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DispatcherStatisticsView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        parameters=[
            {
                'name': 'scope',
                'in': 'query',
                'required': False,
                'schema': {'type': 'string', 'enum': ['my', 'all']},
                'description': 'my - faqat joriy dispatcher tayinlashlari, all - barcha dispatcherlar'
            },
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        today = timezone.now().date()

        scope = (request.query_params.get('scope') or 'my').strip().lower()
        if scope not in ['my', 'all']:
            return Response({'error': 'scope must be one of: my, all'}, status=status.HTTP_400_BAD_REQUEST)
        
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        if date_from:
            try:
                date_from = datetime.strptime(date_from, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_from format'}, status=status.HTTP_400_BAD_REQUEST)
        if date_to:
            try:
                date_to = datetime.strptime(date_to, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_to format'}, status=status.HTTP_400_BAD_REQUEST)
        if date_from and date_to and date_from > date_to:
            return Response({'error': 'date_from cannot be greater than date_to'}, status=status.HTTP_400_BAD_REQUEST)

        range_end = date_to or today
        range_start = date_from or (range_end - timedelta(days=29))
        week_ago = range_end - timedelta(days=7)
        month_ago = range_end - timedelta(days=30)

        assignments = (
            DispatcherAssignment.objects.all()
            if scope == 'all'
            else DispatcherAssignment.objects.filter(dispatcher=request.user)
        )
        assignments = assignments.filter(assigned_at__date__gte=range_start, assigned_at__date__lte=range_end)

        total_assignments = assignments.count()
        today_assignments = assignments.filter(assigned_at__date=range_end).count()
        week_assignments = assignments.filter(assigned_at__date__gte=week_ago).count()
        month_assignments = assignments.filter(assigned_at__date__gte=month_ago).count()

        completed_assignments = assignments.filter(status='completed').count()
        active_assignments = assignments.filter(status__in=['assigned', 'reassigned']).count()

        daily_assignments = []
        days_span = (range_end - range_start).days + 1
        for i in range(days_span):
            date = range_end - timedelta(days=i)
            count = assignments.filter(assigned_at__date=date).count()
            daily_assignments.append({
                'date': date.strftime('%Y-%m-%d'),
                'count': count
            })
        daily_assignments.reverse()
        
        monthly_assignments = []
        for i in range(6):
            month_start = today.replace(day=1) - timedelta(days=30 * i)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            count = assignments.filter(
                assigned_at__date__gte=month_start,
                assigned_at__date__lte=month_end
            ).count()
            monthly_assignments.append({
                'month': month_start.strftime('%Y-%m'),
                'count': count
            })
        monthly_assignments.reverse()
        
        status_distribution = {}
        for status_code, status_name in DispatcherAssignment._meta.get_field('status').choices:
            count = assignments.filter(status=status_code).count()
            status_distribution[status_code] = count

        return Response({
            'scope': scope,
            'date_from': range_start.strftime('%Y-%m-%d'),
            'date_to': range_end.strftime('%Y-%m-%d'),
            'total_assignments': total_assignments,
            'today_assignments': today_assignments,
            'week_assignments': week_assignments,
            'month_assignments': month_assignments,
            'completed_assignments': completed_assignments,
            'active_assignments': active_assignments,
            'daily_assignments': daily_assignments,
            'monthly_assignments': monthly_assignments,
            'status_distribution': status_distribution,
        }, status=status.HTTP_200_OK)


class DispatcherAnalyticsView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

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
        
        my_assignments = DispatcherAssignment.objects.filter(
            dispatcher=request.user,
            assigned_at__date__gte=date_from,
            assigned_at__date__lte=date_to
        )
        
        orders_by_status = {}
        for status_code, status_name in OrderStatus.objects.all().values_list('code', 'name_uz'):
            count = Order.objects.filter(
                dispatcher_assignments__dispatcher=request.user,
                dispatcher_assignments__assigned_at__date__gte=date_from,
                dispatcher_assignments__assigned_at__date__lte=date_to,
                status__code=status_code
            ).distinct().count()
            orders_by_status[status_code] = {'name': status_name, 'count': count}
        
        drivers_performance = DispatcherAssignment.objects.filter(
            dispatcher=request.user,
            assigned_at__date__gte=date_from,
            assigned_at__date__lte=date_to
        ).values('assigned_driver__id', 'assigned_driver__first_name', 'assigned_driver__last_name').annotate(
            total_assignments=Count('id'),
            completed=Count('id', filter=Q(status='completed')),
            cancelled=Count('id', filter=Q(status='cancelled'))
        ).order_by('-total_assignments')[:10]
        
        hourly_distribution = []
        for hour in range(24):
            count = my_assignments.filter(assigned_at__hour=hour).count()
            hourly_distribution.append({'hour': hour, 'count': count})
        
        return Response({
            'orders_by_status': orders_by_status,
            'drivers_performance': list(drivers_performance),
            'hourly_distribution': hourly_distribution,
            'average_completion_time': None,
        }, status=status.HTTP_200_OK)


class DispatcherBulkOperationsView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherBulkRequestSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request):
        order_ids = request.data.get('order_ids', [])
        action = request.data.get('action')
        driver_id = request.data.get('driver_id')
        notes = request.data.get('notes', '')
        
        if not order_ids:
            return Response({'error': 'order_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if action not in ['assign', 'cancel', 'reassign']:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
        
        orders = Order.objects.filter(id__in=order_ids)
        results = {'success': [], 'failed': []}
        
        for order in orders:
            try:
                if action == 'assign':
                    if not driver_id:
                        results['failed'].append({'order_id': order.id, 'error': 'driver_id is required'})
                        continue
                    try:
                        driver = User.objects.get(pk=driver_id, is_driver=True, is_verified=True)
                    except User.DoesNotExist:
                        results['failed'].append({'order_id': order.id, 'error': 'Driver not found or not verified'})
                        continue
                    expired_payload = expired_documents_error_payload(driver)
                    if expired_payload:
                        results['failed'].append({
                            'order_id': order.id,
                            'error': expired_payload['error'],
                            'code': expired_payload['code'],
                        })
                        continue
                    if not order_allows_driver_assignment(order.status.code):
                        results['failed'].append({
                            'order_id': order.id,
                            'error': "Safar boshlangan buyurtmaga haydovchini o'zgartirib bo'lmaydi.",
                        })
                        continue
                    
                    DispatcherAssignment.objects.create(
                        dispatcher=request.user,
                        order=order,
                        assigned_driver=driver,
                        notes=notes
                    )
                    _apply_assigned_driver(order, driver)
                    results['success'].append(order.id)
                
                elif action == 'cancel':
                    cancelled_status = OrderStatus.objects.filter(code='cancelled').first()
                    if cancelled_status:
                        order.status = cancelled_status
                        order.save()
                    assignment = DispatcherAssignment.objects.filter(
                        order=order,
                        dispatcher=request.user,
                        status__in=['assigned', 'reassigned']
                    ).first()
                    if assignment:
                        assignment.status = 'cancelled'
                        assignment.save()
                    results['success'].append(order.id)
                
                elif action == 'reassign':
                    if not driver_id:
                        results['failed'].append({'order_id': order.id, 'error': 'driver_id is required'})
                        continue
                    try:
                        driver = User.objects.get(pk=driver_id, is_driver=True, is_verified=True)
                    except User.DoesNotExist:
                        results['failed'].append({'order_id': order.id, 'error': 'Driver not found or not verified'})
                        continue
                    expired_payload = expired_documents_error_payload(driver)
                    if expired_payload:
                        results['failed'].append({
                            'order_id': order.id,
                            'error': expired_payload['error'],
                            'code': expired_payload['code'],
                        })
                        continue
                    if not order_allows_driver_assignment(order.status.code):
                        results['failed'].append({
                            'order_id': order.id,
                            'error': "Safar boshlangan buyurtmaga haydovchini o'zgartirib bo'lmaydi.",
                        })
                        continue
                    
                    assignment = DispatcherAssignment.objects.filter(
                        order=order,
                        dispatcher=request.user
                    ).first()
                    if assignment:
                        assignment.assigned_driver = driver
                        assignment.reassigned_at = timezone.now()
                        assignment.status = 'reassigned'
                        if notes:
                            assignment.notes = notes
                        assignment.save()
                        order.driver = driver
                        order.save(update_fields=['driver', 'updated_at'])
                        results['success'].append(order.id)
                    else:
                        results['failed'].append({'order_id': order.id, 'error': 'Assignment not found'})
            except Exception as e:
                results['failed'].append({'order_id': order.id, 'error': str(e)})
        
        return Response(results, status=status.HTTP_200_OK)


class DispatcherExportView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

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
        
        my_assignments = DispatcherAssignment.objects.filter(dispatcher=request.user)
        
        if date_from:
            my_assignments = my_assignments.filter(assigned_at__date__gte=date_from)
        if date_to:
            my_assignments = my_assignments.filter(assigned_at__date__lte=date_to)
        
        export_data = []
        for assignment in my_assignments:
            export_data.append({
                'id': assignment.id,
                'order_id': assignment.order.id,
                'driver': f"{assignment.assigned_driver.first_name} {assignment.assigned_driver.last_name}" if assignment.assigned_driver else '',
                'driver_phone': assignment.assigned_driver.phone if assignment.assigned_driver else '',
                'status': assignment.status,
                'assigned_at': assignment.assigned_at.strftime('%Y-%m-%d %H:%M:%S'),
                'notes': assignment.notes or '',
            })
        
        if format_type == 'csv':
            import csv
            from django.http import HttpResponse
            
            response = HttpResponse(content_type='text/csv; charset=utf-8')
            response['Content-Disposition'] = f'attachment; filename="dispatcher_assignments_{timezone.now().date()}.csv"'
            
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


class DispatcherDriverDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, driver_id):
        try:
            driver = User.objects.get(pk=driver_id, is_driver=True)
            from apps.users.serializers import UserSerializer
            from apps.vehicles.models import Vehicle
            from apps.orders.models import Order
            from apps.ratings.models import Rating
            
            vehicles = Vehicle.objects.filter(user=driver, is_verified=True)
            from apps.vehicles.serializers import VehicleSerializer
            
            completed_orders = Order.objects.filter(driver=driver, status__code='completed').count()
            active_orders = Order.objects.filter(
                driver=driver
            ).exclude(status__code__in=['completed', 'cancelled']).count()
            
            assignments = DispatcherAssignment.objects.filter(assigned_driver=driver).count()
            
            return Response({
                'driver': UserSerializer(driver, context={'request': request}).data,
                'vehicles': VehicleSerializer(vehicles, many=True, context={'request': request}).data,
                'completed_orders': completed_orders,
                'active_orders': active_orders,
                'total_assignments': assignments,
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Driver not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherClientDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, client_id):
        try:
            client = User.objects.get(pk=client_id, is_client=True)
            from apps.users.serializers import UserSerializer
            from apps.orders.models import Order
            from apps.payments.models import Payment
            
            total_orders = Order.objects.filter(client=client).count()
            completed_orders = Order.objects.filter(client=client, status__code='completed').count()
            active_orders = Order.objects.filter(
                client=client
            ).exclude(status__code__in=['completed', 'cancelled']).count()
            
            total_spent = Payment.objects.filter(
                order__client=client,
                payment_status='completed',
                completion_fee__isnull=True,
            ).aggregate(total=Sum('amount'))['total'] or 0
            
            recent_orders = Order.objects.filter(client=client).order_by('-created_at')[:5]
            
            return Response({
                'client': UserSerializer(client, context={'request': request}).data,
                'total_orders': total_orders,
                'completed_orders': completed_orders,
                'active_orders': active_orders,
                'total_spent': float(total_spent),
                'recent_orders': OrderSerializer(recent_orders, many=True, context={'request': request}).data,
            }, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherOrdersMapView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: {'type': 'array'}})
    def get(self, request):
        orders = Order.objects.filter(
            current_location_lat__isnull=False,
            current_location_lng__isnull=False
        ).exclude(status__code__in=['completed', 'cancelled'])
        
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DispatcherMonitoringView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    STALE_LOCATION_MINUTES = 20
    DELAYED_PENDING_HOURS = 2
    DOCUMENT_EXPIRY_WARNING_DAYS = 30
    ESCALATION_NOTIFICATION_COOLDOWN_MINUTES = 30

    def _build_document_expiry_alerts(self):
        from apps.users.document_expiry import process_driver_document_expiry_reminders

        result = process_driver_document_expiry_reminders()
        return {
            'items': result['items'],
            'count': result['count'],
            'expired_count': result['expired_count'],
            'expiring_soon_count': result['expiring_soon_count'],
        }

    def _get_eta_risk_and_score(self, order, latest_track, now):
        score = 0
        age_hours = max((now - order.created_at).total_seconds() / 3600, 0)
        score += min(int(age_hours), 24)

        stale_minutes = None
        if latest_track is None:
            score += 30
            stale_minutes = self.STALE_LOCATION_MINUTES + 1
        else:
            stale_minutes = max(int((now - latest_track.timestamp).total_seconds() / 60), 0)
            if stale_minutes > self.STALE_LOCATION_MINUTES:
                score += min(stale_minutes - self.STALE_LOCATION_MINUTES, 40)

        if order.status.code == 'pending' and age_hours >= self.DELAYED_PENDING_HOURS:
            score += 20
        if order.status.code in ['stopped', 'rejected']:
            score += 40
        if order.status.code in ['in_progress', 'in_transit', 'approved_by_client']:
            score += 10

        if score >= 70:
            eta_risk = 'high'
        elif score >= 35:
            eta_risk = 'medium'
        else:
            eta_risk = 'low'

        return eta_risk, score, stale_minutes

    def _parse_delay_threshold_minutes(self, request):
        raw_value = request.query_params.get('delay_threshold_minutes')
        if not raw_value:
            return self.DELAYED_PENDING_HOURS * 60
        try:
            value = int(raw_value)
            if value < 10:
                return 10
            if value > 24 * 60:
                return 24 * 60
            return value
        except (TypeError, ValueError):
            return self.DELAYED_PENDING_HOURS * 60

    def _notify_auto_escalation(self, dispatcher, order, delay_minutes, threshold_minutes):
        cache_key = f"dispatcher_escalation:{dispatcher.id}:{order.id}"
        if cache.get(cache_key):
            return
        create_notification(
            user=dispatcher,
            notification_type='system',
            order=order,
            title='Auto-escalation: kechikish xavfi',
            message=(
                f"Order #{order.id} delay {delay_minutes} min (> {threshold_minutes} min). "
                f"Fallback driver tavsiyasi tayyor."
            ),
            send_push=False,
        )
        cache.set(cache_key, True, timeout=self.ESCALATION_NOTIFICATION_COOLDOWN_MINUTES * 60)

    def _build_driver_load_map(self):
        active_statuses = ['pending', 'in_progress', 'in_transit', 'approved_by_client']
        loads = Order.objects.filter(
            driver_id__isnull=False,
            status__code__in=active_statuses
        ).values('driver_id').annotate(total=Count('id'))
        return {item['driver_id']: item['total'] for item in loads}

    def _build_suggested_drivers_map(self, orders):
        order_ids = [order.id for order in orders]
        assignments = DispatcherAssignment.objects.filter(order_id__in=order_ids).values('order_id', 'assigned_driver_id')
        assigned_by_order = {}
        for item in assignments:
            if item['assigned_driver_id']:
                assigned_by_order.setdefault(item['order_id'], set()).add(item['assigned_driver_id'])

        driver_load_map = self._build_driver_load_map()
        from apps.users.document_expiry import expired_driver_user_ids
        expired_ids = set(expired_driver_user_ids())
        candidates = User.objects.filter(
            is_driver=True,
            is_verified=True,
            is_blocked=False
        ).prefetch_related('vehicles')

        suggestions = {}
        for order in orders:
            order_weight = order.advertisement.weight or 0
            excluded_driver_ids = assigned_by_order.get(order.id, set())
            best = None

            for driver in candidates:
                if driver.id in excluded_driver_ids:
                    continue
                if driver.id in expired_ids:
                    continue

                vehicle = next((v for v in driver.vehicles.all() if v.is_verified), None)
                if not vehicle:
                    continue

                if vehicle.load_capacity < order_weight:
                    continue

                load = driver_load_map.get(driver.id, 0)
                capacity_diff = float(vehicle.load_capacity - order_weight)
                score = 100 - (load * 15) - min(int(capacity_diff), 40)

                if not best or score > best['score']:
                    best = {
                        'driver_id': driver.id,
                        'driver_name': f"{driver.first_name} {driver.last_name}".strip() or driver.phone,
                        'driver_phone': driver.phone,
                        'vehicle_number': vehicle.number,
                        'vehicle_capacity': float(vehicle.load_capacity),
                        'current_load': load,
                        'score': score,
                    }

            suggestions[order.id] = best

        return suggestions

    def _build_priority_recommendations(self, orders, suggestions_map=None):
        now = timezone.now()
        order_ids = [order.id for order in orders]
        latest_tracks_map = {}
        if order_ids:
            for track in OrderLocationTrack.objects.filter(order_id__in=order_ids).order_by('order_id', '-timestamp'):
                if track.order_id not in latest_tracks_map:
                    latest_tracks_map[track.order_id] = track

        recommendations = []
        for order in orders:
            latest_track = latest_tracks_map.get(order.id)
            eta_risk, priority_score, stale_minutes = self._get_eta_risk_and_score(order, latest_track, now)
            recommendations.append({
                'order_id': order.id,
                'status_code': order.status.code,
                'status_name': order.status.name_uz,
                'driver_id': order.driver_id,
                'client_id': order.client_id,
                'priority_score': priority_score,
                'eta_risk': eta_risk,
                'stale_minutes': stale_minutes,
                'updated_at': order.updated_at.isoformat(),
                'suggested_driver': suggestions_map.get(order.id) if suggestions_map else None,
            })

        recommendations.sort(key=lambda item: item['priority_score'], reverse=True)
        return recommendations[:20]

    def _build_order_exceptions(self, orders, dispatcher, delay_threshold_minutes, suggestions_map=None):
        now = timezone.now()
        stale_threshold = now - timedelta(minutes=self.STALE_LOCATION_MINUTES)
        delayed_pending_threshold = now - timedelta(minutes=delay_threshold_minutes)

        order_ids = [order.id for order in orders]
        latest_tracks_map = {}
        if order_ids:
            for track in OrderLocationTrack.objects.filter(order_id__in=order_ids).order_by('order_id', '-timestamp'):
                if track.order_id not in latest_tracks_map:
                    latest_tracks_map[track.order_id] = track

        existing_actions = DispatcherExceptionAction.objects.filter(
            dispatcher=dispatcher,
            order_id__in=order_ids,
            exception_type__in=[
                DispatcherExceptionAction.EXCEPTION_TYPE_STALE_LOCATION,
                DispatcherExceptionAction.EXCEPTION_TYPE_DELAYED_PENDING,
                DispatcherExceptionAction.EXCEPTION_TYPE_PROBLEMATIC_STATUS,
                DispatcherExceptionAction.EXCEPTION_TYPE_ROUTE_DEVIATION,
            ],
        )
        action_map = {(action.order_id, action.exception_type): action for action in existing_actions}

        exceptions = []
        exception_counts = {
            'stale_location': 0,
            'delayed_pending': 0,
            'problematic_status': 0,
            'route_deviation': 0,
        }
        escalated_incidents = []

        for order in orders:
            latest_track = latest_tracks_map.get(order.id)
            common_payload = {
                'order_id': order.id,
                'status_code': order.status.code,
                'status_name': order.status.name_uz,
                'driver_id': order.driver_id,
                'client_id': order.client_id,
            }

            if order.status.code in ['stopped', 'rejected']:
                action = action_map.get((order.id, DispatcherExceptionAction.EXCEPTION_TYPE_PROBLEMATIC_STATUS))
                detector_reference = order.updated_at
                if action and (
                    (action.snoozed_until and action.snoozed_until > now) or
                    (action.acknowledged_at and action.acknowledged_at >= detector_reference)
                ):
                    pass
                else:
                    exception_counts['problematic_status'] += 1
                    exceptions.append({
                        **common_payload,
                        'type': 'problematic_status',
                        'severity': 'high',
                        'message': f"Buyurtma muammoli statusda: {order.status.name_uz}",
                        'detected_at': now.isoformat(),
                    })

            if order.status.code == 'pending' and order.created_at <= delayed_pending_threshold:
                action = action_map.get((order.id, DispatcherExceptionAction.EXCEPTION_TYPE_DELAYED_PENDING))
                detector_reference = order.updated_at
                if action and (
                    (action.snoozed_until and action.snoozed_until > now) or
                    (action.acknowledged_at and action.acknowledged_at >= detector_reference)
                ):
                    pass
                else:
                    exception_counts['delayed_pending'] += 1
                    delay_minutes = max(int((now - order.created_at).total_seconds() / 60), 0)
                    escalation_level = 'critical' if delay_minutes >= delay_threshold_minutes * 2 else 'warning'
                    auto_escalated = delay_minutes >= delay_threshold_minutes
                    fallback_suggestion = suggestions_map.get(order.id) if suggestions_map else None
                    if auto_escalated:
                        self._notify_auto_escalation(
                            dispatcher=dispatcher,
                            order=order,
                            delay_minutes=delay_minutes,
                            threshold_minutes=delay_threshold_minutes,
                        )
                        escalated_incidents.append({
                            **common_payload,
                            'playbook': 'delay_auto_escalation',
                            'delay_minutes': delay_minutes,
                            'threshold_minutes': delay_threshold_minutes,
                            'escalation_level': escalation_level,
                            'fallback_driver': fallback_suggestion,
                            'recommended_actions': [
                                'Call assigned driver / carrier',
                                'Trigger manual override if no response',
                                'Apply fallback driver suggestion',
                            ],
                        })
                    exceptions.append({
                        **common_payload,
                        'type': 'delayed_pending',
                        'severity': 'high' if auto_escalated else 'medium',
                        'message': f"Buyurtma {delay_threshold_minutes} daqiqadan ko'p pending holatda",
                        'detected_at': now.isoformat(),
                        'delay_minutes': delay_minutes,
                        'auto_escalated': auto_escalated,
                        'escalation_level': escalation_level if auto_escalated else 'none',
                        'fallback_driver': fallback_suggestion,
                    })

            if order.status.code in ['in_progress', 'in_transit', 'approved_by_client']:
                has_stale_location = (
                    latest_track is None or
                    latest_track.timestamp <= stale_threshold
                )
                if has_stale_location:
                    action = action_map.get((order.id, DispatcherExceptionAction.EXCEPTION_TYPE_STALE_LOCATION))
                    detector_reference = latest_track.timestamp if latest_track else order.updated_at
                    if action and (
                        (action.snoozed_until and action.snoozed_until > now) or
                        (action.acknowledged_at and action.acknowledged_at >= detector_reference)
                    ):
                        pass
                    else:
                        exception_counts['stale_location'] += 1
                        exceptions.append({
                            **common_payload,
                            'type': 'stale_location',
                            'severity': 'medium',
                            'message': f"Lokatsiya {self.STALE_LOCATION_MINUTES} daqiqadan beri yangilanmagan",
                            'detected_at': now.isoformat(),
                            'last_track_at': latest_track.timestamp.isoformat() if latest_track else None,
                        })

                has_recent_deviation = (
                    order.route_deviation_last_alert_at is not None and
                    order.route_deviation_last_distance_meters is not None and
                    order.route_deviation_last_distance_meters > float(order.route_deviation_threshold_meters) and
                    order.route_deviation_last_alert_at >= now - timedelta(hours=2)
                )
                if has_recent_deviation:
                    action = action_map.get((order.id, DispatcherExceptionAction.EXCEPTION_TYPE_ROUTE_DEVIATION))
                    detector_reference = order.route_deviation_last_alert_at
                    if action and (
                        (action.snoozed_until and action.snoozed_until > now) or
                        (action.acknowledged_at and action.acknowledged_at >= detector_reference)
                    ):
                        pass
                    else:
                        exception_counts['route_deviation'] += 1
                        exceptions.append({
                            **common_payload,
                            'type': 'route_deviation',
                            'severity': 'high',
                            'message': (
                                f"Marshrutdan chiqish aniqlandi: "
                                f"{int(order.route_deviation_last_distance_meters)}m "
                                f"(threshold {order.route_deviation_threshold_meters}m)"
                            ),
                            'detected_at': order.route_deviation_last_alert_at.isoformat(),
                        })

        severity_rank = {'high': 3, 'medium': 2, 'low': 1}
        exceptions.sort(
            key=lambda item: (severity_rank.get(item['severity'], 0), item['detected_at']),
            reverse=True
        )
        escalated_incidents.sort(key=lambda item: item['delay_minutes'], reverse=True)
        return exceptions[:100], exception_counts, escalated_incidents[:50]

    def _build_sla_breach_risk_panel(self, orders, recommendations):
        now = timezone.now()
        recommendation_map = {item['order_id']: item for item in recommendations}
        summary = {'high': 0, 'medium': 0, 'low': 0}
        items = []

        for order in orders:
            deadline = getattr(order.advertisement, 'delivery_deadline', None)
            if not deadline:
                continue
            minutes_to_deadline = int((deadline - now).total_seconds() / 60)
            eta_risk = recommendation_map.get(order.id, {}).get('eta_risk', 'low')

            if minutes_to_deadline <= 0 or eta_risk == 'high':
                risk = 'high'
            elif minutes_to_deadline <= 120 or eta_risk == 'medium':
                risk = 'medium'
            else:
                risk = 'low'

            summary[risk] += 1
            items.append({
                'order_id': order.id,
                'status_code': order.status.code,
                'deadline': deadline.isoformat(),
                'minutes_to_deadline': minutes_to_deadline,
                'eta_risk': eta_risk,
                'sla_breach_risk': risk,
            })

        items.sort(key=lambda item: (item['sla_breach_risk'] != 'high', item['minutes_to_deadline']))
        return {
            'summary': summary,
            'count': len(items),
            'items': items[:50],
        }

    @extend_schema(
        parameters=[
            {'name': 'exception_type', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
            {'name': 'severity', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
            {'name': 'sort', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'enum': ['severity', 'newest']}},
            {'name': 'delay_threshold_minutes', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        from apps.vehicles.models import Vehicle
        
        all_orders = Order.objects.select_related('status', 'driver', 'client').exclude(status__code__in=['completed', 'cancelled'])
        
        active_drivers = User.objects.filter(
            is_driver=True,
            is_verified=True,
            driver_orders__status__code__in=['in_progress', 'in_transit', 'approved_by_client']
        ).distinct()
        
        drivers_with_locations = []
        for driver in active_drivers:
            active_order = Order.objects.filter(
                driver=driver
            ).exclude(status__code__in=['completed', 'cancelled']).first()
            
            if active_order and active_order.current_location_lat and active_order.current_location_lng:
                vehicles = Vehicle.objects.filter(user=driver, is_verified=True)
                drivers_with_locations.append({
                    'driver': {
                        'id': driver.id,
                        'first_name': driver.first_name,
                        'last_name': driver.last_name,
                        'phone': driver.phone,
                    },
                    'order': {
                        'id': active_order.id,
                        'status': {
                            'code': active_order.status.code,
                            'name': active_order.status.name_uz,
                        },
                    },
                    'location': {
                        'lat': float(active_order.current_location_lat),
                        'lng': float(active_order.current_location_lng),
                    },
                    'driver_last_seen_at': (
                        active_order.driver_last_seen_at.isoformat()
                        if active_order.driver_last_seen_at else None
                    ),
                    'driver_app_state': active_order.driver_app_state,
                    'driver_presence': _driver_presence(active_order.driver_last_seen_at or active_order.updated_at),
                    'vehicle': VehicleSerializer(vehicles.first(), context={'request': request}).data if vehicles.exists() else None,
                })
        
        orders_by_status = {}
        for status_code, status_name in OrderStatus.objects.all().values_list('code', 'name_uz'):
            count = all_orders.filter(status__code=status_code).count()
            orders_by_status[status_code] = {
                'name': status_name,
                'count': count,
            }
        
        total_active_drivers = active_drivers.count()
        total_orders = all_orders.count()
        suggestions_map = self._build_suggested_drivers_map(list(all_orders))
        delay_threshold_minutes = self._parse_delay_threshold_minutes(request)
        exceptions, exception_counts, escalated_incidents = self._build_order_exceptions(
            list(all_orders),
            request.user,
            delay_threshold_minutes=delay_threshold_minutes,
            suggestions_map=suggestions_map
        )
        priority_recommendations = self._build_priority_recommendations(list(all_orders), suggestions_map)
        document_expiry_alerts = self._build_document_expiry_alerts()
        sla_breach_risk_panel = self._build_sla_breach_risk_panel(list(all_orders), priority_recommendations)
        eta_risk_summary = {'high': 0, 'medium': 0, 'low': 0}
        for item in priority_recommendations:
            eta_risk_summary[item['eta_risk']] = eta_risk_summary.get(item['eta_risk'], 0) + 1

        exception_type = request.query_params.get('exception_type')
        severity = request.query_params.get('severity')
        sort = request.query_params.get('sort', 'severity')

        if exception_type:
            exceptions = [item for item in exceptions if item['type'] == exception_type]
        if severity:
            exceptions = [item for item in exceptions if item['severity'] == severity]

        if sort == 'newest':
            exceptions.sort(key=lambda item: item['detected_at'], reverse=True)
        
        return Response({
            'drivers_with_locations': drivers_with_locations,
            'orders_by_status': orders_by_status,
            'total_active_drivers': total_active_drivers,
            'total_orders': total_orders,
            'exceptions': exceptions,
            'exceptions_count': len(exceptions),
            'exceptions_by_type': exception_counts,
            'priority_recommendations': priority_recommendations,
            'document_expiry_alerts': document_expiry_alerts,
            'eta_risk_summary': eta_risk_summary,
            'incident_playbook': {
                'delay_threshold_minutes': delay_threshold_minutes,
                'auto_escalated_count': len(escalated_incidents),
                'items': escalated_incidents,
            },
            'sla_breach_risk_panel': sla_breach_risk_panel,
            'timestamp': timezone.now().isoformat(),
        }, status=status.HTTP_200_OK)


class DispatcherExceptionAcknowledgeView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherExceptionAcknowledgeSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request):
        serializer = DispatcherExceptionAcknowledgeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_id = serializer.validated_data['order_id']

        if not Order.objects.filter(id=order_id).exists():
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        action, _ = DispatcherExceptionAction.objects.get_or_create(
            dispatcher=request.user,
            order_id=order_id,
            exception_type=serializer.validated_data['exception_type'],
            defaults={'note': serializer.validated_data.get('note', '')},
        )
        action.acknowledged_at = timezone.now()
        if serializer.validated_data.get('note'):
            action.note = serializer.validated_data['note']
        action.save(update_fields=['acknowledged_at', 'note', 'updated_at'])

        return Response({
            'status': 'ok',
            'message': 'Exception acknowledged',
            'order_id': action.order_id,
            'exception_type': action.exception_type,
            'acknowledged_at': action.acknowledged_at.isoformat(),
        }, status=status.HTTP_200_OK)


class DispatcherExceptionSnoozeView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherExceptionSnoozeSerializer,
        responses={200: {'type': 'object'}}
    )
    def post(self, request):
        serializer = DispatcherExceptionSnoozeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        order_id = serializer.validated_data['order_id']

        if not Order.objects.filter(id=order_id).exists():
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        snoozed_until = timezone.now() + timedelta(minutes=serializer.validated_data['minutes'])
        action, _ = DispatcherExceptionAction.objects.get_or_create(
            dispatcher=request.user,
            order_id=order_id,
            exception_type=serializer.validated_data['exception_type'],
            defaults={'note': serializer.validated_data.get('note', '')},
        )
        action.snoozed_until = snoozed_until
        if serializer.validated_data.get('note'):
            action.note = serializer.validated_data['note']
        action.save(update_fields=['snoozed_until', 'note', 'updated_at'])

        return Response({
            'status': 'ok',
            'message': 'Exception snoozed',
            'order_id': action.order_id,
            'exception_type': action.exception_type,
            'snoozed_until': action.snoozed_until.isoformat(),
        }, status=status.HTTP_200_OK)


class DispatcherSuggestionsAssignView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        request=DispatcherSuggestionAssignSerializer,
        responses={200: DispatcherAssignmentSerializer}
    )
    def post(self, request):
        serializer = DispatcherSuggestionAssignSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        order_id = serializer.validated_data['order_id']
        try:
            order = Order.objects.select_related('status', 'advertisement').get(pk=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code in ['completed', 'cancelled', 'rejected']:
            return Response({'error': 'Order is not assignable'}, status=status.HTTP_400_BAD_REQUEST)

        helper = DispatcherMonitoringView()
        helper.request = request
        suggestions = helper._build_suggested_drivers_map([order])
        suggested = suggestions.get(order.id)
        if not suggested:
            return Response({'error': 'No suitable suggested driver found'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            driver = User.objects.get(pk=suggested['driver_id'], is_driver=True, is_verified=True)
        except User.DoesNotExist:
            return Response({'error': 'Suggested driver not found'}, status=status.HTTP_404_NOT_FOUND)

        expired = _reject_if_expired_documents(driver)
        if expired:
            return expired

        blocked = _reject_if_trip_locked(order)
        if blocked:
            return blocked

        assignment = DispatcherAssignment.objects.create(
            dispatcher=request.user,
            order=order,
            assigned_driver=driver,
            notes='Auto-assigned by suggestion engine'
        )
        _apply_assigned_driver(order, driver)

        return Response(DispatcherAssignmentSerializer(assignment).data, status=status.HTTP_200_OK)


class DispatcherAllDriversLocationView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        parameters=[
            {'name': 'min_lat', 'in': 'query', 'required': False, 'schema': {'type': 'number'}},
            {'name': 'max_lat', 'in': 'query', 'required': False, 'schema': {'type': 'number'}},
            {'name': 'min_lng', 'in': 'query', 'required': False, 'schema': {'type': 'number'}},
            {'name': 'max_lng', 'in': 'query', 'required': False, 'schema': {'type': 'number'}},
        ],
        responses={200: {'type': 'array'}}
    )
    def get(self, request):
        from apps.vehicles.models import Vehicle
        from apps.vehicles.serializers import VehicleSerializer
        
        active_drivers = list(User.objects.filter(
            is_driver=True,
            is_verified=True
        ))
        driver_ids = [driver.id for driver in active_drivers]

        active_orders = list(
            Order.objects.select_related('status').prefetch_related('location_tracks').filter(
                driver_id__in=driver_ids
            ).exclude(status__code__in=['completed', 'cancelled']).order_by('-created_at')
        )
        order_serializer = OrderSerializer(context={'request': request})
        active_order_map = {}
        for order in active_orders:
            if order.driver_id not in active_order_map:
                active_order_map[order.driver_id] = order

        verified_vehicles = list(
            Vehicle.objects.filter(user_id__in=driver_ids, is_verified=True).order_by('-created_at')
        )
        vehicle_map = {}
        for vehicle in verified_vehicles:
            if vehicle.user_id not in vehicle_map:
                vehicle_map[vehicle.user_id] = vehicle

        min_lat = request.query_params.get('min_lat')
        max_lat = request.query_params.get('max_lat')
        min_lng = request.query_params.get('min_lng')
        max_lng = request.query_params.get('max_lng')
        use_bbox = all([min_lat, max_lat, min_lng, max_lng])
        bbox = None
        if use_bbox:
            try:
                bbox = {
                    'min_lat': float(min_lat),
                    'max_lat': float(max_lat),
                    'min_lng': float(min_lng),
                    'max_lng': float(max_lng),
                }
            except (TypeError, ValueError):
                return Response({'error': 'Invalid bbox params'}, status=status.HTTP_400_BAD_REQUEST)
        
        drivers_data = []
        for driver in active_drivers:
            active_order = active_order_map.get(driver.id)
            vehicle = vehicle_map.get(driver.id)
            
            driver_data = {
                'driver': {
                    'id': driver.id,
                    'first_name': driver.first_name,
                    'last_name': driver.last_name,
                    'phone': driver.phone,
                },
                'vehicle': VehicleSerializer(vehicle, context={'request': request}).data if vehicle else None,
                'active_order': None,
                'order': None,
                'location': None,
                'location_updated_at': None,
                'driver_last_seen_at': None,
                'driver_app_state': None,
                'driver_presence': {'status': 'offline', 'stale_level': 'offline', 'age_seconds': None},
            }
            
            if active_order:
                if use_bbox and (not active_order.current_location_lat or not active_order.current_location_lng):
                    continue
                if use_bbox and bbox:
                    lat = float(active_order.current_location_lat)
                    lng = float(active_order.current_location_lng)
                    if lat < bbox['min_lat'] or lat > bbox['max_lat'] or lng < bbox['min_lng'] or lng > bbox['max_lng']:
                        continue

                driver_data['active_order'] = {
                    'id': active_order.id,
                    'status': {
                        'code': active_order.status.code,
                        'name': active_order.status.name_uz,
                    },
                }
                driver_data['order'] = driver_data['active_order']
                
                if active_order.current_location_lat and active_order.current_location_lng:
                    driver_data['location'] = {
                        'lat': float(active_order.current_location_lat),
                        'lng': float(active_order.current_location_lng),
                    }
                    driver_data['location_updated_at'] = active_order.updated_at.isoformat()
                driver_data['driver_last_seen_at'] = (
                    active_order.driver_last_seen_at.isoformat()
                    if active_order.driver_last_seen_at else None
                )
                driver_data['driver_app_state'] = active_order.driver_app_state
                driver_data['driver_presence'] = _driver_presence(
                    active_order.driver_last_seen_at or active_order.updated_at
                )
                driver_data['tracking_summary'] = order_serializer.get_tracking_summary(active_order)
                driver_data['estimated_eta_minutes'] = order_serializer.get_estimated_eta_minutes(active_order)
            
            drivers_data.append(driver_data)
        
        return Response(drivers_data, status=status.HTTP_200_OK)


class DispatcherAllOrdersStatusView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(
        parameters=[
            {'name': 'status', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
        ],
        responses={200: {'type': 'array'}}
    )
    def get(self, request):
        orders = Order.objects.all().order_by('-created_at')
        
        status_filter = request.query_params.get('status')
        if status_filter:
            orders = orders.filter(status__code=status_filter)
        
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class DispatcherDriverOrdersView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: OrderSerializer(many=True)})
    def get(self, request, driver_id):
        try:
            driver = User.objects.get(pk=driver_id, is_driver=True)
            orders = Order.objects.filter(driver=driver).order_by('-created_at')
            serializer = OrderSerializer(orders, many=True, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Driver not found'}, status=status.HTTP_404_NOT_FOUND)


class DispatcherClientOrdersView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcher]

    @extend_schema(responses={200: OrderSerializer(many=True)})
    def get(self, request, client_id):
        try:
            client = User.objects.get(pk=client_id, is_client=True)
            orders = Order.objects.filter(client=client).order_by('-created_at')
            serializer = OrderSerializer(orders, many=True, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except User.DoesNotExist:
            return Response({'error': 'Client not found'}, status=status.HTTP_404_NOT_FOUND)
