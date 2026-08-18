from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema
from django.core.cache import cache
from django.db.models import Q
from apps.users.permissions import IsDriver, IsClient, IsDispatcherOrUpdater, can_access_order
from django.utils import timezone
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt, degrees, atan2
import logging
from .models import (
    Order,
    OrderStatus,
    OrderLocationTrack,
    OrderProofOfDelivery,
    OrderReturnQuality,
    OrderTrackingShareLink,
)
from .serializers import (
    OrderSerializer,
    OrderLocationUpdateSerializer,
    OrderLocationTrackSerializer,
    OrderRoutePlanSerializer,
    OrderProofOfDeliveryCreateSerializer,
    OrderReturnQualitySerializer,
    OrderTrackingShareLinkCreateSerializer,
)
from .statistics import DriverStatisticsService, ClientStatisticsService
from apps.common.services import send_notification_sms
from apps.common.pagination import StandardResultsSetPagination
from apps.common.cache_utils import build_user_cache_key, bump_cache_version, get_cache_version
from apps.notifications.services import create_notification
from apps.users.models import User
from .services import order_accepts_location_updates, TERMINAL_ORDER_STATUS_CODES
from .realtime import (
    broadcast_order_status_changed,
    broadcast_order_payment_updated,
    broadcast_order_client_payment_confirmed,
)

logger = logging.getLogger(__name__)

ORDER_LIST_CACHE_SCOPE = 'orders_list'
ORDER_LIST_CACHE_TTL = 60
ROUTE_DEVIATION_ALERT_COOLDOWN_MINUTES = 5
STOP_ALERT_COOLDOWN_MINUTES = 10
ARRIVAL_SOON_ETA_MINUTES = 15
TRACK_WRITE_MIN_DISTANCE_METERS = 8
TRACK_WRITE_MAX_INTERVAL_SECONDS = 15


def _haversine_meters(lat1, lng1, lat2, lng2):
    r = 6371000
    d_lat = radians(lat2 - lat1)
    d_lng = radians(lng2 - lng1)
    a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
    c = 2 * asin(sqrt(a))
    return r * c


def _bearing_degrees(lat1, lng1, lat2, lng2):
    lat1_r, lat2_r = radians(lat1), radians(lat2)
    d_lng = radians(lng2 - lng1)
    y = sin(d_lng) * cos(lat2_r)
    x = cos(lat1_r) * sin(lat2_r) - sin(lat1_r) * cos(lat2_r) * cos(d_lng)
    return (degrees(atan2(y, x)) + 360.0) % 360.0


def _resolve_live_motion(order, lat, lng, speed_mps, heading, now_ts):
    """Prefer device GPS motion; fall back to last fix delta when missing.

    When nearly stopped, keep the previous heading so the marker does not spin.
    """
    resolved_speed = float(speed_mps) if speed_mps is not None else None
    resolved_heading = float(heading) if heading is not None else None
    if resolved_heading is not None:
        resolved_heading = resolved_heading % 360.0

    prev_lat = order.current_location_lat
    prev_lng = order.current_location_lng
    prev_seen = order.driver_last_seen_at
    prev_heading = order.current_heading
    if prev_lat is None or prev_lng is None or prev_seen is None:
        return resolved_speed, resolved_heading

    dist_m = _haversine_meters(float(prev_lat), float(prev_lng), float(lat), float(lng))
    dt = max((now_ts - prev_seen).total_seconds(), 0.0)
    if resolved_heading is None and dist_m >= 2.0:
        resolved_heading = _bearing_degrees(float(prev_lat), float(prev_lng), float(lat), float(lng))
    if resolved_speed is None and dt >= 0.4 and dist_m >= 1.0:
        resolved_speed = min(dist_m / dt, 80.0)
    if resolved_speed is not None and resolved_speed < 0.3:
        resolved_speed = 0.0
    # Freeze heading while stopped / crawling to avoid compass noise flips.
    if (resolved_speed is not None and resolved_speed < 0.6) or dist_m < 1.5:
        if prev_heading is not None:
            resolved_heading = float(prev_heading) % 360.0
    return resolved_speed, resolved_heading


def _point_segment_distance_meters(lat, lng, a_lat, a_lng, b_lat, b_lng):
    # For logistics city-scale distances this equirectangular projection is sufficient.
    avg_lat_rad = radians((a_lat + b_lat) / 2)
    x1 = radians(a_lng) * cos(avg_lat_rad)
    y1 = radians(a_lat)
    x2 = radians(b_lng) * cos(avg_lat_rad)
    y2 = radians(b_lat)
    px = radians(lng) * cos(avg_lat_rad)
    py = radians(lat)

    dx = x2 - x1
    dy = y2 - y1
    if dx == 0 and dy == 0:
        return _haversine_meters(lat, lng, a_lat, a_lng)

    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    proj_x = x1 + t * dx
    proj_y = y1 + t * dy

    proj_lng = proj_x / cos(avg_lat_rad)
    proj_lat = proj_y
    return _haversine_meters(lat, lng, degrees(proj_lat), degrees(proj_lng))


def _distance_to_route_meters(lat, lng, route_points):
    if len(route_points) < 2:
        return None
    min_distance = None
    for idx in range(len(route_points) - 1):
        start = route_points[idx]
        end = route_points[idx + 1]
        segment_distance = _point_segment_distance_meters(
            lat,
            lng,
            float(start['lat']),
            float(start['lng']),
            float(end['lat']),
            float(end['lng']),
        )
        if min_distance is None or segment_distance < min_distance:
            min_distance = segment_distance
    return min_distance


def _extract_geofence_points(route_points):
    if not isinstance(route_points, list) or len(route_points) < 2:
        return None, None
    try:
        pickup = (float(route_points[0]['lat']), float(route_points[0]['lng']))
        destination = (float(route_points[-1]['lat']), float(route_points[-1]['lng']))
    except (KeyError, TypeError, ValueError):
        return None, None
    return pickup, destination


def _invalidate_order_list_cache(order: Order):
    bump_cache_version(ORDER_LIST_CACHE_SCOPE, 'global')
    user_ids = {order.client_id, order.driver_id}
    for user_id in user_ids:
        if user_id:
            bump_cache_version(ORDER_LIST_CACHE_SCOPE, user_id)


def _estimate_eta_minutes(order: Order):
    from apps.orders.tracking_metrics import estimate_eta_minutes

    return estimate_eta_minutes(order)


def _build_tracking_summary(order: Order):
    return OrderSerializer(order).get_tracking_summary(order)


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer(many=True)})
    def get(self, request):
        status_filter = request.query_params.get('status')
        page = request.query_params.get('page', '1')
        page_size = request.query_params.get('page_size', '20')

        cache_key = build_user_cache_key(
            ORDER_LIST_CACHE_SCOPE,
            request.user.id,
            {
                'global_version': get_cache_version(ORDER_LIST_CACHE_SCOPE, 'global'),
                'status': status_filter or '',
                'page': page,
                'page_size': page_size,
            },
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload, status=status.HTTP_200_OK)

        if request.user.is_dispatcher or request.user.is_updater:
            orders = Order.objects.all()
        else:
            orders = Order.objects.filter(
                Q(driver=request.user) | Q(client=request.user)
            )

        orders = orders.select_related(
            'status',
            'driver',
            'client',
            'advertisement',
            'advertisement__departure_city',
            'advertisement__destination_city',
        ).prefetch_related('documents').order_by('-updated_at', '-id').distinct()

        if status_filter:
            if status_filter == 'active':
                orders = orders.exclude(status__code__in=TERMINAL_ORDER_STATUS_CODES)
            elif status_filter == 'history':
                orders = orders.filter(status__code__in=TERMINAL_ORDER_STATUS_CODES)
            elif status_filter == 'completed':
                orders = orders.filter(status__code='completed')
            else:
                orders = orders.filter(status__code=status_filter)

        paginator = StandardResultsSetPagination()
        page_queryset = paginator.paginate_queryset(orders, request)
        serializer = OrderSerializer(page_queryset, many=True, context={'request': request})
        payload = paginator.get_paginated_response(serializer.data).data
        cache.set(cache_key, payload, ORDER_LIST_CACHE_TTL)
        return Response(payload, status=status.HTTP_200_OK)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer})
    def get(self, request, pk):
        try:
            order = Order.objects.select_related(
                'status',
                'driver',
                'client',
                'advertisement',
                'advertisement__departure_city',
                'advertisement__destination_city',
            ).prefetch_related('documents').get(pk=pk)
            if not can_access_order(request.user, order):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            serializer = OrderSerializer(order, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderStartView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            if order.status.code in ['in_progress', 'in_transit']:
                # Start endpoint should be idempotent for mobile retries/taps.
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK
                )
            if order.status.code != 'approved_by_client':
                return Response(
                    {'error': f'Order cannot be started from status: {order.status.code}'},
                    status=status.HTTP_400_BAD_REQUEST
                )

            in_progress_status = OrderStatus.objects.get(code='in_progress')
            from apps.orders.route_stops import (
                hydrate_missing_stop_coordinates,
                require_geocoded_terminal_stops,
            )

            hydrate_missing_stop_coordinates(order)
            try:
                require_geocoded_terminal_stops(order)
            except ValueError as exc:
                return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

            order.status = in_progress_status
            order.started_at = timezone.now()
            order.save()
            _invalidate_order_list_cache(order)

            status_message = (
                f"Haydovchi {order.driver.first_name} yuklash manziliga yo'lga chiqdi. "
                f"Buyurtma #{order.id}."
            )
            try:
                send_notification_sms(order.client.phone, status_message)
                create_notification(
                    user=order.client,
                    notification_type='order_started',
                    title='Haydovchi yo\'lda',
                    message=status_message,
                    order=order,
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(order, message=status_message)
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderDepartView(APIView):
    """Cargo loaded — driver departs to destination (Yandex Taxi-style «Поехали»)."""
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            if order.status.code == 'in_transit':
                return Response(
                    OrderSerializer(order, context={'request': request}).data,
                    status=status.HTTP_200_OK,
                )
            if order.status.code != 'in_progress':
                return Response(
                    {'error': f'Order cannot depart from status: {order.status.code}'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from apps.orders.transitions import prepare_and_depart

            order = prepare_and_depart(order, request.user)
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)


class OrderStopView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.select_related('advertisement', 'status').get(pk=pk, driver=request.user)
            if order.status.code not in ('in_progress', 'in_transit', 'approved_by_client'):
                return Response(
                    {'error': 'Buyurtmani to\'xtatish faqat faol holatda mumkin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            stopped_status = OrderStatus.objects.get(code='stopped')
            order.status = stopped_status
            order.save(update_fields=['status', 'updated_at'])
            from apps.orders.marketplace_recovery import reopen_advertisement_marketplace

            reopen_advertisement_marketplace(order.advertisement)
            _invalidate_order_list_cache(order)

            from apps.subscriptions.trial import restore_trial_for_order

            restore_trial_for_order(order)

            try:
                client_name = f"{order.client.first_name} {order.client.last_name}".strip() or order.client.phone
                create_notification(
                    user=order.client,
                    notification_type='order_cancelled',
                    title='Buyurtma to\'xtatildi',
                    message=f"Haydovchi buyurtma #{order.id}ni to'xtatdi. E'lon qayta ochiq.",
                    order=order,
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Buyurtma #{order.id} haydovchi tomonidan to'xtatildi.",
            )
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderApproveByClientView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            if order.client_id != request.user.id:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            if order.status.code != 'pending':
                return Response({'error': 'Only pending orders can be approved'}, status=status.HTTP_400_BAD_REQUEST)
            
            approved_status = OrderStatus.objects.filter(code='approved_by_client').first()
            if not approved_status:
                approved_status = OrderStatus.objects.create(
                    code='approved_by_client',
                    name_ru='Одобрен клиентом',
                    name_en='Approved by Client',
                    name_uz='Mijoz tomonidan tasdiqlangan'
                )
            
            order.status = approved_status
            order.save()
            _invalidate_order_list_cache(order)
            
            try:
                driver_phone = order.driver.phone
                client_name = f"{order.client.first_name} {order.client.last_name}"
                message = f"Mijoz {client_name} buyurtmani tasdiqladi. Buyurtma #{order.id} endi yo'lga chiqishingiz mumkin."
                send_notification_sms(driver_phone, message)
                
                # In-app notification
                create_notification(
                    user=order.driver,
                    notification_type='order_approved',
                    title='Buyurtma tasdiqlandi',
                    message=f"Mijoz {client_name} buyurtmani tasdiqladi. Buyurtma #{order.id} endi yo'lga chiqishingiz mumkin.",
                    order=order
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Mijoz buyurtmani tasdiqladi. Buyurtma #{order.id}.",
            )
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderDeclineByClientView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.select_related('advertisement', 'driver', 'client', 'status').get(pk=pk)
            if order.client_id != request.user.id:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            if order.status.code not in ('pending', 'approved_by_client'):
                return Response(
                    {'error': 'Faqat kutilayotgan yoki tasdiqlangan buyurtmani rad etish mumkin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from apps.payments.escrow import settle_order_cancellation
            settle_order_cancellation(order, actor='client')

            cancelled_status = OrderStatus.objects.filter(code='cancelled').first()
            if not cancelled_status:
                cancelled_status = OrderStatus.objects.create(
                    code='cancelled',
                    name_ru='Отменён',
                    name_en='Cancelled',
                    name_uz='Bekor qilingan',
                )

            order.status = cancelled_status
            order.save(update_fields=['status', 'updated_at'])
            from apps.orders.marketplace_recovery import reopen_advertisement_marketplace

            reopen_advertisement_marketplace(order.advertisement)
            _invalidate_order_list_cache(order)

            from apps.subscriptions.trial import restore_trial_for_order
            restore_trial_for_order(order)

            try:
                client_name = f"{order.client.first_name} {order.client.last_name}".strip() or order.client.phone
                create_notification(
                    user=order.driver,
                    notification_type='order_cancelled',
                    title='Buyurtma bekor qilindi',
                    message=f"Mijoz {client_name} buyurtma #{order.id}ni rad etdi. E'lon qayta ochiq.",
                    order=order,
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Buyurtma #{order.id} mijoz tomonidan bekor qilindi.",
            )
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderMarkDriverPaymentView(APIView):
    """Haydovchi mijozdan to'lov olgan-yo'qligini belgilaydi (platforma aralashmaydi)."""
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(
        request={'type': 'object', 'properties': {'received': {'type': 'boolean'}}},
        responses={200: OrderSerializer},
    )
    def post(self, request, pk):
        received = request.data.get('received')
        if received is None or not isinstance(received, bool):
            return Response({'error': 'received (boolean) is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code in ('cancelled', 'rejected', 'pending', 'completed', 'stopped'):
            return Response(
                {'error': 'To\'lov holatini faqat faol buyurtmada belgilash mumkin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.client_payment_confirmed = received
        order.client_payment_confirmed_at = timezone.now()
        order.save(update_fields=['client_payment_confirmed', 'client_payment_confirmed_at', 'updated_at'])
        _invalidate_order_list_cache(order)
        broadcast_order_client_payment_confirmed(order)

        if not received:
            from apps.orders.payment_notify import notify_client_payment_needed

            notify_client_payment_needed(order, source='driver_unpaid')

        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderConfirmClientPaymentView(APIView):
    """Mijoz offline to'lov qilganini bildiradi (platforma aralashmaydi)."""
    permission_classes = [IsAuthenticated, IsClient]

    @extend_schema(
        request={'type': 'object', 'properties': {'paid': {'type': 'boolean'}}},
        responses={200: OrderSerializer},
    )
    def post(self, request, pk):
        paid = request.data.get('paid')
        if paid is None or not isinstance(paid, bool):
            return Response({'error': 'paid (boolean) is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(pk=pk, client=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code in ('cancelled', 'rejected', 'pending', 'completed', 'stopped'):
            return Response(
                {'error': 'To\'lov holatini faqat faol buyurtmada belgilash mumkin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.client_paid_reported = paid
        order.client_paid_reported_at = timezone.now()
        order.save(update_fields=['client_paid_reported', 'client_paid_reported_at', 'updated_at'])
        _invalidate_order_list_cache(order)

        from apps.orders.realtime import broadcast_order_client_payment_reported
        from apps.orders.payment_notify import notify_driver_client_reported_paid

        broadcast_order_client_payment_reported(order)
        if paid:
            notify_driver_client_reported_paid(order, paid=True)

        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderConfirmDeliveryView(APIView):
    """Client confirms cargo was received at destination."""
    permission_classes = [IsAuthenticated, IsClient]

    @extend_schema(
        request={'type': 'object', 'properties': {'received': {'type': 'boolean'}}},
        responses={200: OrderSerializer},
    )
    def post(self, request, pk):
        received = request.data.get('received')
        if received is None or not isinstance(received, bool):
            return Response({'error': 'received (boolean) is required'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            order = Order.objects.get(pk=pk, client=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code not in ('in_transit',):
            return Response(
                {'error': 'Yukni faqat yetkazish vaqtida tasdiqlash mumkin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        pod = OrderProofOfDelivery.objects.filter(order=order).first()
        if not pod or not pod.delivery_photo:
            return Response(
                {'error': 'Avval haydovchi POD (foto bilan) yuborishi kerak.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.client_delivery_confirmed = received
        order.client_delivery_confirmed_at = timezone.now()
        order.save(update_fields=['client_delivery_confirmed', 'client_delivery_confirmed_at', 'updated_at'])
        _invalidate_order_list_cache(order)

        from apps.orders.realtime import broadcast_order_delivery_confirmed

        broadcast_order_delivery_confirmed(order)
        if received:
            try:
                create_notification(
                    user=order.driver,
                    notification_type='order_approved',
                    title='Yuk qabul qilindi',
                    message=f"Mijoz buyurtma #{order.id} yukini qabul qilganini tasdiqladi.",
                    order=order,
                )
            except Exception:
                logger.exception(
                    'Failed to notify driver about delivery confirmation',
                    extra={'event': 'order_delivery_confirm_notify_failed', 'order_id': order.id},
                )
            try:
                from apps.orders.payment_notify import notify_client_payment_needed

                notify_client_payment_needed(order, source='delivery_confirmed')
            except Exception:
                logger.exception(
                    'Failed to notify client about payment after delivery',
                    extra={'event': 'order_delivery_payment_notify_failed', 'order_id': order.id},
                )

        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            
            if order.status.code != 'in_transit':
                return Response(
                    {'error': 'Buyurtmani yakunlash uchun avval «Poexali» bosib manzilga yo\'lga chiqing.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if order.total_amount <= 0:
                return Response(
                    {'error': 'Buyurtma narxi belgilanmagan. Administrator yoki mijoz bilan bog\'laning.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            pod = OrderProofOfDelivery.objects.filter(order=order).first()
            if not pod or not pod.delivery_photo:
                return Response({
                    'error': 'Buyurtmani yakunlash uchun POD (imzo, foto, geolokatsiya) majburiy.'
                }, status=status.HTTP_400_BAD_REQUEST)

            from apps.payments.ledger import ensure_wallet
            ensure_wallet(order.driver)

            if not order.is_payment_settled:
                return Response(
                    {
                        'error': (
                            'Buyurtmani yakunlash uchun avval «To\'lov qilindi» tugmasini bosing.'
                        ),
                        'code': 'payment_required',
                        'client_payment_confirmed': order.client_payment_confirmed,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

            from apps.orders.route_stops import (
                ensure_default_route_stops,
                final_delivery_was_skipped,
                order_has_incomplete_route_stops,
            )

            ensure_default_route_stops(order)
            if order_has_incomplete_route_stops(order):
                return Response(
                    {'error': 'Barcha marshrut nuqtalarini yakunlang yoki o\'tkazib yuboring.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if final_delivery_was_skipped(order):
                return Response(
                    {'error': 'Yetkazish nuqtasini yakunlang — o\'tkazib bo\'lmaydi.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if order.client_delivery_confirmed is not True:
                return Response(
                    {
                        'error': 'Buyurtmani yakunlash uchun mijoz yukni qabul qilganini tasdiqlashi kerak.',
                        'code': 'delivery_confirmation_required',
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            
            completed_status = OrderStatus.objects.get(code='completed')
            order.status = completed_status
            order.completed_at = timezone.now()
            order.save()
            from apps.orders.distance_tracking import on_order_completed

            on_order_completed(order)
            order.refresh_from_db()
            from apps.payments.escrow import settle_driver_on_complete
            settle_driver_on_complete(order)
            try:
                from apps.orders.documents import ensure_order_documents

                ensure_order_documents(order)
            except Exception:
                logger.exception(
                    'Failed to generate order documents',
                    extra={'event': 'order_documents_failed', 'order_id': order.id},
                )
            _invalidate_order_list_cache(order)
            
            try:
                client_phone = order.client.phone
                driver_name = f"{order.driver.first_name} {order.driver.last_name}"
                message = f"Buyurtma #{order.id} muvaffaqiyatli yakunlandi! Haydovchi: {driver_name}."
                send_notification_sms(client_phone, message)
                
                # In-app notification
                create_notification(
                    user=order.client,
                    notification_type='order_completed',
                    title='Buyurtma yakunlandi',
                    message=f"Buyurtma #{order.id} muvaffaqiyatli yakunlandi! Haydovchi: {driver_name}.",
                    order=order
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Buyurtma #{order.id} yakunlandi.",
            )
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderRejectView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            if order.status.code not in ('pending', 'approved_by_client'):
                return Response(
                    {'error': 'Faqat kutilayotgan yoki tasdiqlangan buyurtmani rad etish mumkin.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            from apps.payments.escrow import settle_order_cancellation
            settle_order_cancellation(order, actor='driver')
            rejected_status = OrderStatus.objects.get(code='rejected')
            order.status = rejected_status
            order.save(update_fields=['status', 'updated_at'])
            from apps.orders.marketplace_recovery import reopen_advertisement_marketplace

            reopen_advertisement_marketplace(order.advertisement)
            _invalidate_order_list_cache(order)
            from apps.subscriptions.trial import restore_trial_for_order
            from apps.orders.realtime import broadcast_order_status_changed

            restore_trial_for_order(order)

            try:
                driver_name = f"{order.driver.first_name} {order.driver.last_name}".strip() or order.driver.phone
                create_notification(
                    user=order.client,
                    notification_type='order_cancelled',
                    title='Buyurtma rad etildi',
                    message=f"Haydovchi {driver_name} buyurtma #{order.id}ni rad etdi. E'lon qayta ochiq.",
                    order=order,
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Buyurtma #{order.id} haydovchi tomonidan rad etildi.",
            )
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderCancelView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'type': 'object', 'properties': {'reason': {'type': 'string'}}},
        responses={200: OrderSerializer},
    )
    def post(self, request, pk):
        try:
            order = Order.objects.select_related('advertisement', 'driver', 'client', 'status').get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.client_id != request.user.id and order.driver_id != request.user.id:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        if order.status.code not in ('in_progress', 'in_transit'):
            return Response(
                {'error': 'Faol buyurtmani bekor qilish uchun /decline yoki /reject ishlating.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actor = 'client' if order.client_id == request.user.id else 'driver'
        from apps.payments.escrow import settle_order_cancellation
        settlement = settle_order_cancellation(order, actor=actor)

        cancelled_status = OrderStatus.objects.filter(code='cancelled').first()
        if not cancelled_status:
            cancelled_status = OrderStatus.objects.create(
                code='cancelled',
                name_ru='Отменён',
                name_en='Cancelled',
                name_uz='Bekor qilingan',
            )
        order.status = cancelled_status
        order.save(update_fields=['status', 'updated_at'])
        from apps.orders.marketplace_recovery import reopen_advertisement_marketplace
        reopen_advertisement_marketplace(order.advertisement)
        _invalidate_order_list_cache(order)

        counterpart = order.driver if actor == 'client' else order.client
        try:
            create_notification(
                user=counterpart,
                notification_type='order_cancelled',
                title='Buyurtma bekor qilindi',
                message=f"Buyurtma #{order.id} bekor qilindi. Jarima: {settlement.get('fee', 0)} so'm.",
                order=order,
            )
        except Exception:
            logger.exception('Failed to send cancellation notification', extra={'order_id': order.id})

        broadcast_order_status_changed(
            order,
            message=f"Buyurtma #{order.id} bekor qilindi.",
        )
        payload = OrderSerializer(order, context={'request': request}).data
        payload['cancellation'] = settlement
        return Response(payload, status=status.HTTP_200_OK)


class OrderTrackView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderLocationTrackSerializer(many=True)})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            if not can_access_order(request.user, order):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            try:
                limit = int(request.query_params.get('limit', 100))
            except (TypeError, ValueError):
                limit = 100
            limit = max(10, min(limit, 500))
            tracks = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')[:limit]
            serializer = OrderLocationTrackSerializer(tracks, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderUpdateLocationView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=OrderLocationUpdateSerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        serializer = OrderLocationUpdateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk, driver=request.user)
                if not order_accepts_location_updates(order.status.code):
                    return Response(
                        {
                            'code': 'location_updates_not_allowed',
                            'error': (
                                'Joylashuv yangilash faqat faol yo\'lda bo\'lgan '
                                'buyurtmalar uchun mumkin.'
                            ),
                        },
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lat = serializer.validated_data['lat']
                lng = serializer.validated_data['lng']
                app_state = serializer.validated_data.get('app_state')
                now_ts = timezone.now()
                raw_lat = float(lat)
                raw_lng = float(lng)
                from apps.orders.map_match import match_live_location

                route_match = match_live_location(order, raw_lat, raw_lng)
                display_lat, display_lng = raw_lat, raw_lng
                snapped = False
                route_offset_meters = None
                route_progress_m = None
                if route_match is not None:
                    route_offset_meters = route_match.distance_m
                    route_progress_m = route_match.progress_m
                    if route_match.snapped:
                        display_lat, display_lng = route_match.lat, route_match.lng
                        snapped = True

                speed_mps, heading = _resolve_live_motion(
                    order,
                    raw_lat,
                    raw_lng,
                    serializer.validated_data.get('speed_mps'),
                    serializer.validated_data.get('heading'),
                    now_ts,
                )
                if snapped and route_match is not None and route_match.heading is not None:
                    heading = route_match.heading

                order.current_location_lat = display_lat
                order.current_location_lng = display_lng
                order.current_speed_mps = speed_mps
                order.current_heading = heading
                order.driver_last_seen_at = now_ts
                if app_state:
                    order.driver_app_state = app_state
                route_deviation_payload = None
                geofence_event_payloads = []
                route_points = order.planned_route_points or []
                if (not route_points or len(route_points) < 2):
                    recent_tracks = list(
                        OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')[:20]
                    )
                    if len(recent_tracks) >= 5:
                        route_points = [
                            {'lat': float(track.lat), 'lng': float(track.lng)}
                            for track in reversed(recent_tracks)
                        ]
                if isinstance(route_points, list) and len(route_points) >= 2:
                    distance_m = _distance_to_route_meters(raw_lat, raw_lng, route_points)
                    order.route_deviation_last_distance_meters = distance_m
                    if distance_m is not None and distance_m > order.route_deviation_threshold_meters:
                        now = timezone.now()
                        should_alert = (
                            order.route_deviation_last_alert_at is None or
                            order.route_deviation_last_alert_at <= now - timedelta(minutes=ROUTE_DEVIATION_ALERT_COOLDOWN_MINUTES)
                        )
                        if should_alert:
                            order.route_deviation_last_alert_at = now
                            order.route_deviation_count = (order.route_deviation_count or 0) + 1
                            route_deviation_payload = {
                                'type': 'route_deviation',
                                'order_id': order.id,
                                'driver_id': order.driver_id,
                                'distance_meters': round(float(distance_m), 2),
                                'threshold_meters': order.route_deviation_threshold_meters,
                                'lat': raw_lat,
                                'lng': raw_lng,
                                'updated_at': now.isoformat(),
                            }
                    from apps.orders.route_stops import order_has_geocoded_route_stops, process_route_stop_geofence
                    for stop_event in process_route_stop_geofence(order, raw_lat, raw_lng, now_ts):
                        geofence_event_payloads.append({
                            'event': stop_event['type'],
                            'notification_type': 'route_stop_arrived',
                            'title': 'Route stop reached',
                            'message': (
                                f"Buyurtma #{order.id}: "
                                f"{stop_event.get('label') or stop_event['stop_type']} "
                                f"(#{stop_event['sequence']}) hududiga yetib keldi"
                            ),
                            'stop_id': stop_event.get('stop_id'),
                            'sequence': stop_event.get('sequence'),
                            'stop_type': stop_event.get('stop_type'),
                            'label': stop_event.get('label'),
                        })

                    if not order_has_geocoded_route_stops(order):
                        pickup_point, destination_point = _extract_geofence_points(route_points)
                        if pickup_point and destination_point:
                            pickup_distance = _haversine_meters(raw_lat, raw_lng, pickup_point[0], pickup_point[1])
                            destination_distance = _haversine_meters(raw_lat, raw_lng, destination_point[0], destination_point[1])
                            now = timezone.now()

                            entered_pickup = pickup_distance <= float(order.pickup_geofence_radius_meters)
                            entered_destination = destination_distance <= float(order.destination_geofence_radius_meters)

                            if entered_pickup and not order.is_in_pickup_geofence:
                                order.is_in_pickup_geofence = True
                                order.pickup_entered_at = now
                                geofence_event_payloads.append({
                                    'event': 'pickup_enter',
                                    'title': 'Pickup geofence entered',
                                    'message': f"Buyurtma #{order.id}: haydovchi yuklash hududiga kirdi",
                                })

                            if (not entered_pickup) and order.is_in_pickup_geofence:
                                order.is_in_pickup_geofence = False
                                order.pickup_exited_at = now
                                geofence_event_payloads.append({
                                    'event': 'pickup_exit',
                                    'title': 'Pickup geofence exited',
                                    'message': f"Buyurtma #{order.id}: haydovchi yuklash hududidan chiqdi",
                                })

                            if entered_destination and not order.is_in_destination_geofence:
                                order.is_in_destination_geofence = True
                                order.destination_entered_at = now
                                geofence_event_payloads.append({
                                    'event': 'destination_enter',
                                    'title': 'Destination geofence entered',
                                    'message': f"Buyurtma #{order.id}: haydovchi yetkazish hududiga kirdi",
                                })

                            if (not entered_destination) and order.is_in_destination_geofence:
                                order.is_in_destination_geofence = False
                                geofence_event_payloads.append({
                                    'event': 'destination_exit',
                                    'title': 'Destination geofence exited',
                                    'message': f"Buyurtma #{order.id}: haydovchi yetkazish hududidan chiqdi",
                                })
                order.save()
                _invalidate_order_list_cache(order)

                latest_track = (
                    OrderLocationTrack.objects.filter(order=order)
                    .order_by('-timestamp')
                    .first()
                )
                should_write_track = True
                if latest_track:
                    distance_from_last_m = _haversine_meters(
                        float(latest_track.lat),
                        float(latest_track.lng),
                        raw_lat,
                        raw_lng,
                    )
                    elapsed_seconds = max(
                        0.0,
                        (now_ts - latest_track.timestamp).total_seconds()
                    )
                    should_write_track = (
                        distance_from_last_m >= TRACK_WRITE_MIN_DISTANCE_METERS
                        or elapsed_seconds >= TRACK_WRITE_MAX_INTERVAL_SECONDS
                    )
                if should_write_track:
                    OrderLocationTrack.objects.create(order=order, lat=raw_lat, lng=raw_lng)
                tracking_summary = _build_tracking_summary(order)
                estimated_eta_minutes = _estimate_eta_minutes(order)
                driver_presence = {
                    'status': 'online',
                    'stale_level': 'online',
                    'age_seconds': 0,
                    'last_seen_at': now_ts.isoformat(),
                    'app_state': order.driver_app_state or None,
                }
                stop_alert_payload = None
                alert_level = tracking_summary.get('alert_level') if tracking_summary else None
                alert_message = tracking_summary.get('alert_message') if tracking_summary else None
                if alert_level and alert_message:
                    cooldown_key = f"order_stop_alert:{order.id}:{alert_level}"
                    if not cache.get(cooldown_key):
                        stop_alert_payload = {
                            'type': 'stop_alert',
                            'order_id': order.id,
                            'driver_id': order.driver_id,
                            'level': alert_level,
                            'message': alert_message,
                            'updated_at': timezone.now().isoformat(),
                        }
                        cache.set(cooldown_key, True, STOP_ALERT_COOLDOWN_MINUTES * 60)
                if (
                    estimated_eta_minutes is not None
                    and estimated_eta_minutes <= ARRIVAL_SOON_ETA_MINUTES
                    and order.status.code in ('in_progress', 'in_transit')
                ):
                    arrival_key = f'order_arrival_soon:{order.id}'
                    if not cache.get(arrival_key):
                        arrival_message = (
                            f"Haydovchi taxminan {estimated_eta_minutes} daqiqada yetib keladi"
                        )
                        create_notification(
                            user=order.client,
                            notification_type='driver_arriving',
                            title='Haydovchi yaqinlashmoqda',
                            message=arrival_message,
                            order=order,
                            extra_push_data={'eta_minutes': estimated_eta_minutes},
                        )
                        cache.set(arrival_key, True, 60 * 60)
                from apps.orders.realtime import (
                    broadcast_geofence_event,
                    broadcast_location_update,
                    broadcast_route_stop_arrived,
                    fanout_order_tracking,
                )

                broadcast_location_update(
                    order,
                    lat=display_lat,
                    lng=display_lng,
                    tracking_summary=tracking_summary,
                    estimated_eta_minutes=estimated_eta_minutes,
                    driver_last_seen_at=now_ts.isoformat(),
                    driver_app_state=order.driver_app_state,
                    driver_presence=driver_presence,
                    speed_mps=speed_mps,
                    heading=heading,
                    raw_lat=raw_lat,
                    raw_lng=raw_lng,
                    snapped=snapped,
                    route_offset_meters=route_offset_meters,
                    route_progress_m=route_progress_m,
                )
                if stop_alert_payload:
                    fanout_order_tracking(order, stop_alert_payload)
                if route_deviation_payload:
                    fanout_order_tracking(order, route_deviation_payload)
                for event in geofence_event_payloads:
                    broadcast_geofence_event(
                        order,
                        event=event['event'],
                        lat=raw_lat,
                        lng=raw_lng,
                        message=event.get('message'),
                        title=event.get('title'),
                        stop_id=event.get('stop_id'),
                        sequence=event.get('sequence'),
                        stop_type=event.get('stop_type'),
                        label=event.get('label'),
                        notification_type=event.get('notification_type'),
                    )
                    if event.get('event') == 'route_stop_arrived':
                        broadcast_route_stop_arrived(
                            order,
                            {
                                'stop_id': event.get('stop_id'),
                                'sequence': event.get('sequence'),
                                'stop_type': event.get('stop_type'),
                                'label': event.get('label'),
                                'detected_at': now_ts.isoformat(),
                            },
                            lat=raw_lat,
                            lng=raw_lng,
                        )
                if route_deviation_payload:
                    dispatchers = User.objects.filter(is_dispatcher=True, is_active=True)
                    for dispatcher in dispatchers:
                        create_notification(
                            user=dispatcher,
                            notification_type='route_deviation',
                            title='Route deviation',
                            message=(
                                f"Buyurtma #{order.id}: haydovchi marshrutdan chiqdi "
                                f"({route_deviation_payload['distance_meters']}m)"
                            ),
                            order=order
                        )
                if geofence_event_payloads:
                    dispatchers = User.objects.filter(is_dispatcher=True, is_active=True)
                    for payload in geofence_event_payloads:
                        notification_type = payload.get('notification_type', 'geofence_event')
                        create_notification(
                            user=order.client,
                            notification_type=notification_type,
                            title=payload['title'],
                            message=payload['message'],
                            order=order,
                        )
                        for dispatcher in dispatchers:
                            create_notification(
                                user=dispatcher,
                                notification_type=notification_type,
                                title=payload['title'],
                                message=payload['message'],
                                order=order,
                            )
                if stop_alert_payload:
                    push_extra = {
                        'alert_level': alert_level,
                        'priority': 'high',
                    }
                    create_notification(
                        user=order.client,
                        notification_type='stop_alert',
                        title='Haydovchi to‘xtab qoldi',
                        message=alert_message,
                        order=order,
                        extra_push_data=push_extra,
                    )
                    if order.driver_id:
                        create_notification(
                            user=order.driver,
                            notification_type='stop_alert',
                            title='Uzoq to‘xtash',
                            message=alert_message,
                            order=order,
                            extra_push_data=push_extra,
                        )
                    dispatchers = User.objects.filter(is_dispatcher=True, is_active=True)
                    for dispatcher in dispatchers:
                        create_notification(
                            user=dispatcher,
                            notification_type='stop_alert',
                            title='Stop alert',
                            message=f"Buyurtma #{order.id}: {alert_message}",
                            order=order,
                            extra_push_data=push_extra,
                        )
                    updaters = User.objects.filter(is_updater=True, is_active=True)
                    for updater in updaters:
                        create_notification(
                            user=updater,
                            notification_type='stop_alert',
                            title='Stop alert',
                            message=f"Buyurtma #{order.id}: {alert_message}",
                            order=order,
                            extra_push_data=push_extra,
                        )
                
                return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class OrderRoutePlanView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=OrderRoutePlanSerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        serializer = OrderRoutePlanSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        from apps.orders.services import order_allows_route_mutations

        if not order_allows_route_mutations(order.status.code):
            return Response(
                {'error': 'Marshrutni faqat safar boshlanishidan oldin o\'zgartirish mumkin.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order.planned_route_points = serializer.validated_data['points']
        order.route_deviation_threshold_meters = serializer.validated_data['threshold_meters']
        order.pickup_geofence_radius_meters = serializer.validated_data['pickup_geofence_radius_meters']
        order.destination_geofence_radius_meters = serializer.validated_data['destination_geofence_radius_meters']
        order.save(update_fields=[
            'planned_route_points',
            'route_deviation_threshold_meters',
            'pickup_geofence_radius_meters',
            'destination_geofence_radius_meters',
            'updated_at',
        ])
        _invalidate_order_list_cache(order)
        return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderProofOfDeliveryCreateView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=OrderProofOfDeliveryCreateSerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code != 'in_transit':
            return Response(
                {'error': 'POD faqat yuk olingandan keyin, yetkazish manzilida yuboriladi.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        serializer = OrderProofOfDeliveryCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        from apps.orders.route_stops import ensure_default_route_stops, validate_pod_at_delivery

        ensure_default_route_stops(order)
        try:
            validate_pod_at_delivery(
                order,
                serializer.validated_data['delivered_lat'],
                serializer.validated_data['delivered_lng'],
            )
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        OrderProofOfDelivery.objects.update_or_create(
            order=order,
            defaults={
                **serializer.validated_data,
                'delivered_by': request.user,
            }
        )
        from apps.orders.safety import log_custody_event
        from apps.orders.models import OrderCustodyEvent

        log_custody_event(
            order=order,
            actor=request.user,
            event_type=OrderCustodyEvent.EVENT_DELIVERY,
            witness_name=serializer.validated_data.get('receiver_name', ''),
            lat=serializer.validated_data.get('delivered_lat'),
            lng=serializer.validated_data.get('delivered_lng'),
            note=serializer.validated_data.get('note', ''),
        )
        _invalidate_order_list_cache(order)
        try:
            from apps.orders.realtime import publish_order_pod_submitted

            publish_order_pod_submitted(order)
        except Exception:
            logger.exception(
                'Failed to notify client about POD',
                extra={'event': 'order_pod_notify_failed', 'order_id': order.id},
            )
        refreshed = Order.objects.select_related('status', 'driver', 'client').get(pk=order.pk)
        return Response(OrderSerializer(refreshed, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderReturnQualityView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcherOrUpdater]

    @extend_schema(request=OrderReturnQualitySerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = OrderReturnQualitySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        OrderReturnQuality.objects.update_or_create(
            order=order,
            defaults={
                **serializer.validated_data,
                'classified_by': request.user,
            }
        )
        _invalidate_order_list_cache(order)
        refreshed = Order.objects.select_related('status', 'driver', 'client').get(pk=order.pk)
        return Response(OrderSerializer(refreshed, context={'request': request}).data, status=status.HTTP_200_OK)


class OrderTrackingShareLinkCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=OrderTrackingShareLinkCreateSerializer, responses={200: {'type': 'object'}})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        serializer = OrderTrackingShareLinkCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        expires_in_hours = serializer.validated_data['expires_in_hours']
        expires_at = timezone.now() + timedelta(hours=expires_in_hours)
        share, _ = OrderTrackingShareLink.objects.update_or_create(
            order=order,
            defaults={
                'created_by': request.user,
                'is_active': True,
                'expires_at': expires_at,
            }
        )

        order.eta_share_enabled = True
        order.eta_share_expires_at = expires_at
        order.save(update_fields=['eta_share_enabled', 'eta_share_expires_at', 'updated_at'])
        _invalidate_order_list_cache(order)

        public_url = request.build_absolute_uri(f'/api/orders/share/{share.token}/')
        if order.client and order.client.phone:
            try:
                send_notification_sms(
                    order.client.phone,
                    f"Buyurtma #{order.id} kuzatuv havolasi: {public_url}"
                )
            except Exception:
                pass

        return Response({
            'token': str(share.token),
            'expires_at': share.expires_at.isoformat(),
            'public_url': public_url,
        }, status=status.HTTP_200_OK)


class PublicOrderTrackingShareView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, token):
        try:
            share = OrderTrackingShareLink.objects.select_related('order', 'order__status').get(token=token)
        except OrderTrackingShareLink.DoesNotExist:
            return Response({'error': 'Share link not found'}, status=status.HTTP_404_NOT_FOUND)

        if (not share.is_active) or share.expires_at <= timezone.now():
            return Response({'error': 'Share link expired'}, status=status.HTTP_410_GONE)

        share.last_accessed_at = timezone.now()
        share.save(update_fields=['last_accessed_at', 'updated_at'])
        order = share.order
        eta_minutes = _estimate_eta_minutes(order)

        return Response({
            'order_id': order.id,
            'status_code': order.status.code,
            'current_location': {
                'lat': float(order.current_location_lat) if order.current_location_lat is not None else None,
                'lng': float(order.current_location_lng) if order.current_location_lng is not None else None,
            },
            'speed_mps': float(order.current_speed_mps) if order.current_speed_mps is not None else None,
            'heading': float(order.current_heading) if order.current_heading is not None else None,
            'eta_minutes': eta_minutes,
            'updated_at': order.updated_at.isoformat(),
            'expires_at': share.expires_at.isoformat(),
            'driver_last_seen_at': (
                order.driver_last_seen_at.isoformat() if order.driver_last_seen_at else None
            ),
        }, status=status.HTTP_200_OK)


class DriverStatisticsView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

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
            }
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        date_from_obj = None
        date_to_obj = None
        
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_from format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_to format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        statistics = DriverStatisticsService.get_driver_statistics(
            request.user,
            date_from_obj,
            date_to_obj
        )
        
        return Response(statistics, status=status.HTTP_200_OK)


class ClientStatisticsView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

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
            }
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        
        date_from_obj = None
        date_to_obj = None
        
        if date_from:
            try:
                date_from_obj = datetime.strptime(date_from, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_from format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        if date_to:
            try:
                date_to_obj = datetime.strptime(date_to, '%Y-%m-%d').date()
            except ValueError:
                return Response({'error': 'Invalid date_to format. Use YYYY-MM-DD'}, status=status.HTTP_400_BAD_REQUEST)
        
        statistics = ClientStatisticsService.get_client_statistics(
            request.user,
            date_from_obj,
            date_to_obj
        )
        
        return Response(statistics, status=status.HTTP_200_OK)


class OrderVerifyByQRView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'type': 'object', 'properties': {'qr_code': {'type': 'string'}}},
        responses={200: OrderSerializer}
    )
    def post(self, request):
        qr_code = request.data.get('qr_code')
        
        if not qr_code:
            return Response({'error': 'QR code is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # QR kod format: ORDER-{order_id} yoki faqat order_id
            order_id = None
            if qr_code.startswith('ORDER-'):
                order_id = int(qr_code.replace('ORDER-', ''))
            else:
                try:
                    order_id = int(qr_code)
                except ValueError:
                    return Response({'error': 'Invalid QR code format'}, status=status.HTTP_400_BAD_REQUEST)
            
            order = Order.objects.get(pk=order_id)
            
            if not can_access_order(request.user, order):
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
            serializer = OrderSerializer(order, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError:
            return Response({'error': 'Invalid QR code format'}, status=status.HTTP_400_BAD_REQUEST)


class OrderVerifyAndApproveByQRView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'type': 'object', 'properties': {'qr_code': {'type': 'string'}}},
        responses={200: OrderSerializer}
    )
    def post(self, request):
        qr_code = request.data.get('qr_code')
        
        if not qr_code:
            return Response({'error': 'QR code is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            # QR kod format: ORDER-{order_id} yoki faqat order_id
            order_id = None
            if qr_code.startswith('ORDER-'):
                order_id = int(qr_code.replace('ORDER-', ''))
            else:
                try:
                    order_id = int(qr_code)
                except ValueError:
                    return Response({'error': 'Invalid QR code format'}, status=status.HTTP_400_BAD_REQUEST)
            
            order = Order.objects.get(pk=order_id)
            if order.client_id != request.user.id:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
            if order.status.code != 'pending':
                return Response({'error': 'Only pending orders can be approved'}, status=status.HTTP_400_BAD_REQUEST)
            
            approved_status = OrderStatus.objects.filter(code='approved_by_client').first()
            if not approved_status:
                approved_status = OrderStatus.objects.create(
                    code='approved_by_client',
                    name_ru='Одобрен клиентом',
                    name_en='Approved by Client',
                    name_uz='Mijoz tomonidan tasdiqlangan'
                )
            
            order.status = approved_status
            order.save()
            _invalidate_order_list_cache(order)
            
            try:
                driver_phone = order.driver.phone
                client_name = f"{order.client.first_name} {order.client.last_name}"
                message = f"Mijoz {client_name} buyurtmani QR kod orqali tasdiqladi. Buyurtma #{order.id} endi yo'lga chiqishingiz mumkin."
                send_notification_sms(driver_phone, message)
                
                # In-app notification
                create_notification(
                    user=order.driver,
                    notification_type='order_approved',
                    title='Buyurtma tasdiqlandi',
                    message=f"Mijoz {client_name} buyurtmani QR kod orqali tasdiqladi. Buyurtma #{order.id} endi yo'lga chiqishingiz mumkin.",
                    order=order
                )
            except Exception as e:
                logger.exception(
                    'Failed to send order notification',
                    extra={'event': 'order_notify_failed'},
                )

            broadcast_order_status_changed(
                order,
                message=f"Mijoz buyurtmani QR kod orqali tasdiqladi. Buyurtma #{order.id}.",
            )
            
            serializer = OrderSerializer(order, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except ValueError:
            return Response({'error': 'Invalid QR code format'}, status=status.HTTP_400_BAD_REQUEST)
