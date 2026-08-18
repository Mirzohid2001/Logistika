from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.users.permissions import IsDriver
from apps.orders.models import Order, OrderRouteStop
from apps.orders.serializers import (
    OrderRouteStopSerializer,
    OrderRouteStopCreateSerializer,
    OrderRouteOptimizeSerializer,
    OrderSerializer,
)
from apps.orders.route_stops import (
    apply_optimized_stop_order,
    complete_route_stop,
    ensure_default_route_stops,
    sync_planned_route_from_stops,
)
from apps.orders.routing import optimize_route
from apps.orders.services import order_allows_route_mutations, order_allows_stop_completion
from apps.orders.views import _invalidate_order_list_cache
from apps.users.permissions import can_access_order


def _ensure_route_mutable(order: Order) -> Response | None:
    if not order_allows_route_mutations(order.status.code):
        return Response(
            {'error': 'Marshrutni faqat faol buyurtmada o\'zgartirish mumkin.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


class OrderRouteStopListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderRouteStopSerializer(many=True)})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        ensure_default_route_stops(order)
        stops = order.route_stops.order_by('sequence')
        return Response(OrderRouteStopSerializer(stops, many=True).data)

    @extend_schema(request=OrderRouteStopCreateSerializer, responses={201: OrderRouteStopSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if order.driver_id != request.user.id:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        blocked = _ensure_route_mutable(order)
        if blocked:
            return blocked

        serializer = OrderRouteStopCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        next_sequence = (order.route_stops.order_by('-sequence').values_list('sequence', flat=True).first() or 0) + 1
        stop = OrderRouteStop.objects.create(order=order, sequence=data.get('sequence', next_sequence), **{
            k: v for k, v in data.items() if k != 'sequence'
        })
        sync_planned_route_from_stops(order)
        _invalidate_order_list_cache(order)
        return Response(OrderRouteStopSerializer(stop).data, status=status.HTTP_201_CREATED)


class OrderRouteStopDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=OrderRouteStopCreateSerializer, responses={200: OrderRouteStopSerializer})
    def patch(self, request, pk, stop_id):
        try:
            order = Order.objects.get(pk=pk)
            stop = OrderRouteStop.objects.get(pk=stop_id, order=order)
        except (Order.DoesNotExist, OrderRouteStop.DoesNotExist):
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if order.driver_id != request.user.id:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        blocked = _ensure_route_mutable(order)
        if blocked:
            return blocked

        serializer = OrderRouteStopCreateSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        for field, value in serializer.validated_data.items():
            setattr(stop, field, value)
        stop.save()
        sync_planned_route_from_stops(order)
        _invalidate_order_list_cache(order)
        return Response(OrderRouteStopSerializer(stop).data)

    def delete(self, request, pk, stop_id):
        try:
            order = Order.objects.get(pk=pk)
            stop = OrderRouteStop.objects.get(pk=stop_id, order=order)
        except (Order.DoesNotExist, OrderRouteStop.DoesNotExist):
            return Response({'error': 'Not found'}, status=status.HTTP_404_NOT_FOUND)
        if order.driver_id != request.user.id:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        blocked = _ensure_route_mutable(order)
        if blocked:
            return blocked
        if order.route_stops.count() <= 2:
            return Response({'error': 'Order must keep at least two stops'}, status=status.HTTP_400_BAD_REQUEST)
        stop.delete()
        for index, remaining in enumerate(order.route_stops.order_by('sequence'), start=1):
            if remaining.sequence != index:
                remaining.sequence = index
                remaining.save(update_fields=['sequence'])
        sync_planned_route_from_stops(order)
        _invalidate_order_list_cache(order)
        return Response(status=status.HTTP_204_NO_CONTENT)


class OrderRouteStopCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk, stop_id):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not order_allows_stop_completion(order.status.code):
            return Response(
                {'error': 'Marshrut nuqtasini faqat faol safarda yakunlash mumkin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        skip = bool(request.data.get('skip', False))
        skip_reason = str(request.data.get('skip_reason') or '').strip()
        skip_note = str(
            request.data.get('notes')
            or request.data.get('skip_note')
            or ''
        ).strip()
        try:
            stop = complete_route_stop(
                order,
                stop_id,
                request.user,
                skip=skip,
                skip_reason=skip_reason,
                skip_note=skip_note,
            )
        except OrderRouteStop.DoesNotExist:
            return Response({'error': 'Stop not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        from apps.orders.models import OrderCustodyEvent
        from apps.orders.safety import log_custody_event

        if not skip:
            if stop.stop_type == OrderRouteStop.STOP_PICKUP:
                event_type = OrderCustodyEvent.EVENT_PICKUP
            elif stop.stop_type == OrderRouteStop.STOP_DELIVERY:
                event_type = OrderCustodyEvent.EVENT_DELIVERY
            else:
                event_type = OrderCustodyEvent.EVENT_STOP
            log_custody_event(
                order=order,
                actor=request.user,
                event_type=event_type,
                lat=stop.lat,
                lng=stop.lng,
                note=stop.label or stop.address,
                metadata={'stop_id': stop.id, 'sequence': stop.sequence},
            )

        _invalidate_order_list_cache(order)
        from apps.orders.realtime import publish_route_stop_completed

        publish_route_stop_completed(order, stop, skipped=skip)
        order = Order.objects.select_related('status', 'driver', 'client', 'advertisement').get(pk=pk)
        return Response(OrderSerializer(order, context={'request': request}).data)


class OrderRouteOptimizeView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=OrderRouteOptimizeSerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        serializer = OrderRouteOptimizeSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        blocked = _ensure_route_mutable(order)
        if blocked:
            return blocked

        ensure_default_route_stops(order)
        stops = list(order.route_stops.order_by('sequence'))
        stop_payload = [
            {'id': s.id, 'lat': float(s.lat), 'lng': float(s.lng), 'sequence': s.sequence}
            for s in stops
            if s.lat is not None and s.lng is not None
        ]
        if len(stop_payload) < 2:
            return Response({'error': 'Stops need coordinates before optimization'}, status=status.HTTP_400_BAD_REQUEST)

        preference = serializer.validated_data.get('preference') or order.advertisement.route_preference
        try:
            result = optimize_route(stop_payload, preference=preference)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        apply_optimized_stop_order(order, result['ordered_stop_ids'])
        order.optimized_route_polyline = result.get('polyline', [])
        order.optimized_route_distance_meters = result.get('distance_meters')
        order.optimized_route_duration_seconds = result.get('duration_seconds')
        order.route_optimization_provider = result.get('provider', '')
        order.save(
            update_fields=[
                'optimized_route_polyline',
                'optimized_route_distance_meters',
                'optimized_route_duration_seconds',
                'route_optimization_provider',
                'updated_at',
            ]
        )
        _invalidate_order_list_cache(order)
        order = Order.objects.select_related('status', 'driver', 'client', 'advertisement').get(pk=pk)
        return Response(
            {
                'order': OrderSerializer(order, context={'request': request}).data,
                'optimization': result,
            },
            status=status.HTTP_200_OK,
        )
