from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.users.permissions import IsDriver, IsDispatcherOrUpdater, can_access_order
from apps.users.models import User
from apps.common.openapi import EmptySerializer

from .models import Order, OrderCustodyEvent, OrderSOSAlert
from .safety import acknowledge_sos_alert, log_custody_event, resolve_sos_alert, trigger_driver_sos
from .serializers import (
    OrderCustodyEventSerializer,
    OrderCustodyEventCreateSerializer,
    OrderSOSAlertSerializer,
    SOSTriggerSerializer,
)
from .views import _invalidate_order_list_cache


class OrderCustodyChainView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderCustodyEventSerializer(many=True)})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        events = order.custody_events.select_related('actor').order_by('created_at')
        return Response(OrderCustodyEventSerializer(events, many=True, context={'request': request}).data)

    @extend_schema(request=OrderCustodyEventCreateSerializer, responses={201: OrderCustodyEventSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        if order.driver_id != request.user.id and not (
            request.user.is_dispatcher or request.user.is_updater
        ):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = OrderCustodyEventCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        event = log_custody_event(
            order=order,
            actor=request.user,
            event_type=serializer.validated_data['event_type'],
            witness_name=serializer.validated_data.get('witness_name', ''),
            lat=serializer.validated_data.get('lat'),
            lng=serializer.validated_data.get('lng'),
            note=serializer.validated_data.get('note', ''),
            metadata=serializer.validated_data.get('metadata') or {},
        )
        if serializer.validated_data.get('photo'):
            event.photo = serializer.validated_data['photo']
            event.save(update_fields=['photo'])
        return Response(
            OrderCustodyEventSerializer(event, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class OrderSOSTriggerView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=SOSTriggerSerializer, responses={200: OrderSOSAlertSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = SOSTriggerSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        alert = trigger_driver_sos(
            order=order,
            driver=request.user,
            lat=float(serializer.validated_data['lat']),
            lng=float(serializer.validated_data['lng']),
            message=str(serializer.validated_data.get('message') or '').strip(),
        )
        _invalidate_order_list_cache(order)
        return Response(OrderSOSAlertSerializer(alert).data, status=status.HTTP_200_OK)


class OrderSOSAcknowledgeView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated, IsDispatcherOrUpdater]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        alert = (
            OrderSOSAlert.objects.filter(order=order, status=OrderSOSAlert.STATUS_ACTIVE)
            .order_by('-created_at')
            .first()
        )
        if not alert:
            return Response({'error': 'Faol SOS topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        acknowledge_sos_alert(alert, request.user)
        return Response(OrderSOSAlertSerializer(alert).data)


class OrderSOSResolveView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated, IsDispatcherOrUpdater]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        alert = (
            OrderSOSAlert.objects.filter(
                order=order,
                status__in=[OrderSOSAlert.STATUS_ACTIVE, OrderSOSAlert.STATUS_ACKNOWLEDGED],
            )
            .order_by('-created_at')
            .first()
        )
        if not alert:
            return Response({'error': 'SOS topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        resolve_sos_alert(alert)
        return Response(OrderSOSAlertSerializer(alert).data)


class ActiveSOSAlertsView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated, IsDispatcherOrUpdater]

    def get(self, request):
        alerts = (
            OrderSOSAlert.objects.filter(status__in=[OrderSOSAlert.STATUS_ACTIVE, OrderSOSAlert.STATUS_ACKNOWLEDGED])
            .select_related('order', 'driver', 'acknowledged_by')
            .order_by('-created_at')[:50]
        )
        return Response(OrderSOSAlertSerializer(alerts, many=True).data)
