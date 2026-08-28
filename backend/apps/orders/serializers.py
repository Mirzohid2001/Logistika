from rest_framework import serializers
from math import radians, cos, sin, asin, sqrt
from .models import (
    Order,
    OrderStatus,
    OrderLocationTrack,
    OrderRouteStop,
    OrderProofOfDelivery,
    OrderReturnQuality,
    OrderTrackingShareLink,
    OrderCustodyEvent,
    OrderSOSAlert,
)
from apps.common.services import get_language_from_request
from apps.users.serializers import UserSerializer
from apps.advertisements.serializers import AdvertisementDetailSerializer


class OrderStatusSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_name(self, obj):
        return getattr(obj, f'name_{self.lang}', obj.name_ru)

    class Meta:
        model = OrderStatus
        fields = ['id', 'name', 'code']


class OrderLocationTrackSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderLocationTrack
        fields = ['id', 'lat', 'lng', 'timestamp']


class OrderSerializer(serializers.ModelSerializer):
    advertisement = AdvertisementDetailSerializer(read_only=True)
    proof_of_delivery = serializers.SerializerMethodField()
    return_quality = serializers.SerializerMethodField()
    tracking_share = serializers.SerializerMethodField()
    status = OrderStatusSerializer(read_only=True)
    driver = UserSerializer(read_only=True)
    client = UserSerializer(read_only=True)
    total_amount = serializers.ReadOnlyField()
    paid_amount = serializers.ReadOnlyField()
    remaining_amount = serializers.ReadOnlyField()
    is_fully_paid = serializers.ReadOnlyField()
    payment_progress = serializers.ReadOnlyField()
    estimated_eta_minutes = serializers.SerializerMethodField()
    tracking_summary = serializers.SerializerMethodField()
    distance_summary = serializers.SerializerMethodField()
    driver_presence = serializers.SerializerMethodField()
    route_stops = serializers.SerializerMethodField()
    custody_events = serializers.SerializerMethodField()
    active_sos = serializers.SerializerMethodField()
    escrow = serializers.SerializerMethodField()
    documents = serializers.SerializerMethodField()

    class Meta:
        model = Order
        fields = ['id', 'advertisement', 'driver', 'client', 'status', 'current_location_lat', 'current_location_lng',
                  'current_speed_mps', 'current_heading',
                  'planned_route_points', 'optimized_route_polyline', 'optimized_route_distance_meters',
                  'optimized_route_duration_seconds', 'route_optimization_provider', 'route_stops',
                  'tracked_distance_meters', 'loaded_distance_meters', 'tracked_distance_computed_at', 'distance_summary',
                  'route_deviation_threshold_meters', 'route_deviation_last_alert_at',
                  'route_deviation_last_distance_meters', 'route_deviation_count',
                  'pickup_geofence_radius_meters', 'destination_geofence_radius_meters',
                  'is_in_pickup_geofence', 'is_in_destination_geofence',
                  'pickup_entered_at', 'pickup_exited_at', 'destination_entered_at',
                  'eta_share_enabled', 'eta_share_expires_at',
                  'driver_last_seen_at', 'driver_app_state', 'driver_presence',
                  'estimated_eta_minutes', 'tracking_summary',
                  'proof_of_delivery', 'return_quality', 'tracking_share',
                  'custody_events', 'active_sos', 'escrow', 'documents',
                  'total_amount', 'paid_amount', 'remaining_amount', 'is_fully_paid', 'payment_progress',
                  'payment_disputed',
                  'client_paid_reported', 'client_paid_reported_at',
                  'client_payment_confirmed', 'client_payment_confirmed_at',
                  'client_delivery_confirmed', 'client_delivery_confirmed_at',
                  'created_at', 'updated_at', 'started_at', 'completed_at']
        read_only_fields = [
            'id', 'created_at', 'updated_at', 'total_amount', 'paid_amount', 'remaining_amount',
            'is_fully_paid', 'payment_progress', 'payment_disputed', 'client_paid_reported', 'client_paid_reported_at',
            'client_payment_confirmed', 'client_payment_confirmed_at',
            'client_delivery_confirmed', 'client_delivery_confirmed_at',
            'tracked_distance_meters', 'loaded_distance_meters', 'tracked_distance_computed_at',
            'current_speed_mps', 'current_heading',
        ]

    def _haversine_meters(self, lat1, lng1, lat2, lng2):
        r = 6371000
        d_lat = radians(lat2 - lat1)
        d_lng = radians(lng2 - lng1)
        a = sin(d_lat / 2) ** 2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(d_lng / 2) ** 2
        c = 2 * asin(sqrt(a))
        return r * c

    def get_route_stops(self, obj):
        stops = getattr(obj, '_prefetched_route_stops', None)
        if stops is None:
            stops = obj.route_stops.order_by('sequence')
        return OrderRouteStopSerializer(stops, many=True).data

    def get_custody_events(self, obj):
        events = getattr(obj, '_prefetched_custody_events', None)
        if events is None:
            events = obj.custody_events.select_related('actor').order_by('created_at')
        return OrderCustodyEventSerializer(events, many=True, context=self.context).data

    def get_active_sos(self, obj):
        alert = (
            obj.sos_alerts.filter(status__in=[OrderSOSAlert.STATUS_ACTIVE, OrderSOSAlert.STATUS_ACKNOWLEDGED])
            .order_by('-created_at')
            .first()
        )
        if not alert:
            return None
        return OrderSOSAlertSerializer(alert).data

    def get_escrow(self, obj):
        from django.core.exceptions import ObjectDoesNotExist
        try:
            escrow = obj.escrow
        except ObjectDoesNotExist:
            return None
        remaining = (
            (escrow.funded_amount or 0)
            - (escrow.released_to_driver or 0)
            - (escrow.commission_amount or 0)
            - (escrow.refunded_amount or 0)
            - (escrow.cancellation_fee or 0)
        )
        return {
            'status': escrow.status,
            'funded_amount': float(escrow.funded_amount),
            'released_to_driver': float(escrow.released_to_driver),
            'commission_amount': float(escrow.commission_amount),
            'refunded_amount': float(escrow.refunded_amount),
            'cancellation_fee': float(escrow.cancellation_fee),
            'remaining_amount': float(remaining),
        }

    def get_documents(self, obj):
        from apps.orders.documents import serialize_order_document

        docs = getattr(obj, '_prefetched_objects_cache', {}).get('documents')
        if docs is None:
            docs = obj.documents.all()
        request = self.context.get('request')
        return [serialize_order_document(doc, request) for doc in docs]

    def _recent_tracks(self, obj, limit=200):
        return list(obj.location_tracks.all().order_by('-timestamp')[:limit])

    def _tracking_alert_message(self, stop_minutes):
        if stop_minutes is None or stop_minutes < 5:
            return None

        request = self.context.get('request')
        language = get_language_from_request(request) if request is not None else 'ru'
        templates = {
            'ru': 'Водитель стоит без движения уже {minutes} мин.',
            'uz': 'Haydovchi {minutes} daqiqadan beri harakatsiz turibdi.',
            'en': 'The driver has been stationary for {minutes} min.',
        }
        return templates.get(language, templates['ru']).format(minutes=stop_minutes)

    def _build_tracking_metrics(self, obj):
        tracks = self._recent_tracks(obj, limit=200)
        latest = tracks[0] if tracks else None
        previous = tracks[1] if len(tracks) > 1 else None
        last_update = latest.timestamp if latest else obj.updated_at
        speed_kmh = None
        total_stop_minutes = 0
        total_moving_minutes = 0
        stop_count = 0
        last_stop_minutes = None
        longest_stop_minutes = 0
        current_stop_started_at = None
        last_movement_at = None
        status = 'unknown'

        if latest and previous:
            delta_sec = max((latest.timestamp - previous.timestamp).total_seconds(), 1)
            dist_m = self._haversine_meters(float(previous.lat), float(previous.lng), float(latest.lat), float(latest.lng))
            speed_kmh = (dist_m / 1000.0) / (delta_sec / 3600.0)
            status = 'stopped' if dist_m < 30 else 'moving'
            if dist_m >= 30:
                last_movement_at = latest.timestamp

        if tracks:
            ordered_tracks = list(reversed(tracks))
            segment_stop_started_at = None
            for idx in range(1, len(ordered_tracks)):
                prev = ordered_tracks[idx - 1]
                curr = ordered_tracks[idx]
                delta_minutes = max(int((curr.timestamp - prev.timestamp).total_seconds() / 60), 0)
                dist_m = self._haversine_meters(float(prev.lat), float(prev.lng), float(curr.lat), float(curr.lng))
                is_stop_segment = dist_m < 30
                if is_stop_segment:
                    if segment_stop_started_at is None:
                        segment_stop_started_at = prev.timestamp
                else:
                    total_moving_minutes += delta_minutes
                    last_movement_at = curr.timestamp
                    if segment_stop_started_at is not None:
                        stop_duration = max(int((prev.timestamp - segment_stop_started_at).total_seconds() / 60), 0)
                        stop_count += 1
                        total_stop_minutes += stop_duration
                        longest_stop_minutes = max(longest_stop_minutes, stop_duration)
                        segment_stop_started_at = None
            if segment_stop_started_at is not None:
                stop_count += 1
                current_stop_started_at = segment_stop_started_at
                end_time = ordered_tracks[-1].timestamp
                last_stop_minutes = max(int((end_time - segment_stop_started_at).total_seconds() / 60), 0)
                total_stop_minutes += last_stop_minutes
                longest_stop_minutes = max(longest_stop_minutes, last_stop_minutes)
                status = 'stopped'

        route_points = obj.planned_route_points or []
        progress_percent = None
        remaining_distance_km = None
        navigation_points = None
        if obj.current_location_lat is not None and obj.current_location_lng is not None:
            from apps.orders.tracking_metrics import compute_route_progress, get_navigation_points

            try:
                current_lat = float(obj.current_location_lat)
                current_lng = float(obj.current_location_lng)
                progress_percent, remaining_distance_km = compute_route_progress(
                    current_lat,
                    current_lng,
                    get_navigation_points(route_points),
                )
            except (TypeError, ValueError):
                progress_percent = None
                remaining_distance_km = None

        metrics = {
            'status': status,
            'last_update_at': last_update.isoformat() if last_update else None,
            'speed_kmh': round(speed_kmh, 1) if speed_kmh is not None else None,
            'last_stop_minutes': last_stop_minutes,
            'longest_stop_minutes': longest_stop_minutes,
            'total_stop_minutes': total_stop_minutes,
            'total_moving_minutes': total_moving_minutes,
            'stop_count': stop_count,
            'progress_percent': progress_percent,
            'remaining_distance_km': remaining_distance_km,
            'current_stop_started_at': current_stop_started_at.isoformat() if current_stop_started_at else None,
            'last_movement_at': last_movement_at.isoformat() if last_movement_at else None,
            'alert_level': (
                'critical' if (last_stop_minutes is not None and last_stop_minutes >= 15)
                else 'warning' if (last_stop_minutes is not None and last_stop_minutes >= 5)
                else None
            ),
            'alert_message': self._tracking_alert_message(last_stop_minutes),
        }
        from apps.orders.distance_tracking import build_distance_summary

        metrics.update(build_distance_summary(obj))
        return metrics

    def get_distance_summary(self, obj):
        from apps.orders.distance_tracking import build_distance_summary

        return build_distance_summary(obj)

    def get_estimated_eta_minutes(self, obj):
        from apps.orders.tracking_metrics import estimate_eta_minutes

        return estimate_eta_minutes(obj, self._recent_tracks(obj, limit=2))

    def get_tracking_summary(self, obj):
        return self._build_tracking_metrics(obj)

    def get_driver_presence(self, obj):
        from django.utils import timezone

        last_seen = obj.driver_last_seen_at or obj.updated_at
        if not last_seen:
            return {
                'status': 'offline',
                'stale_level': 'offline',
                'age_seconds': None,
                'last_seen_at': None,
            }
        age_seconds = max(0, int((timezone.now() - last_seen).total_seconds()))
        if age_seconds <= 30:
            stale_level = 'online'
        elif age_seconds <= 60:
            stale_level = 'warning'
        elif age_seconds <= 180:
            stale_level = 'stale'
        else:
            stale_level = 'offline'
        return {
            'status': 'online' if stale_level in ['online', 'warning'] else 'offline',
            'stale_level': stale_level,
            'age_seconds': age_seconds,
            'last_seen_at': last_seen.isoformat(),
            'app_state': obj.driver_app_state or None,
        }

    def get_proof_of_delivery(self, obj):
        pod = getattr(obj, 'proof_of_delivery', None)
        if not pod:
            return None
        request = self.context.get('request')
        photo_url = None
        if pod.delivery_photo:
            try:
                photo_url = request.build_absolute_uri(pod.delivery_photo.url) if request else pod.delivery_photo.url
            except Exception:
                photo_url = None
        return {
            'id': pod.id,
            'receiver_name': pod.receiver_name,
            'receiver_signature': pod.receiver_signature,
            'delivery_photo': photo_url,
            'delivered_lat': float(pod.delivered_lat),
            'delivered_lng': float(pod.delivered_lng),
            'delivered_at': pod.delivered_at.isoformat(),
            'note': pod.note,
        }

    def get_return_quality(self, obj):
        quality = getattr(obj, 'return_quality', None)
        if not quality:
            return None
        request = self.context.get('request')
        photo_url = None
        if quality.photo:
            try:
                photo_url = request.build_absolute_uri(quality.photo.url) if request else quality.photo.url
            except Exception:
                photo_url = None
        return {
            'id': quality.id,
            'quality_status': quality.quality_status,
            'note': quality.note,
            'photo': photo_url,
            'classified_by': quality.classified_by_id,
            'classified_at': quality.classified_at.isoformat(),
        }

    def get_tracking_share(self, obj):
        share = getattr(obj, 'tracking_share', None)
        if not share:
            return None
        request = self.context.get('request')
        public_url = None
        if request:
            public_url = request.build_absolute_uri(f'/api/orders/share/{share.token}/')
        return {
            'token': str(share.token),
            'is_active': share.is_active,
            'expires_at': share.expires_at.isoformat(),
            'public_url': public_url,
        }


class OrderLocationUpdateSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=12, decimal_places=8)
    lng = serializers.DecimalField(max_digits=12, decimal_places=8)
    app_state = serializers.ChoiceField(
        choices=['foreground', 'background', 'inactive'],
        required=False
    )
    speed_mps = serializers.FloatField(required=False, allow_null=True)
    heading = serializers.FloatField(required=False, allow_null=True)

    def validate_speed_mps(self, value):
        if value is None:
            return None
        try:
            speed = float(value)
        except (TypeError, ValueError):
            return None
        if speed < 0 or speed != speed or speed == float('inf'):
            return None
        return min(speed, 80.0)

    def validate_heading(self, value):
        if value is None:
            return None
        try:
            heading = float(value)
        except (TypeError, ValueError):
            return None
        if heading < 0 or heading != heading or heading == float('inf'):
            return None
        return heading % 360.0


class OrderRouteStopSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderRouteStop
        fields = [
            'id', 'sequence', 'stop_type', 'label', 'address', 'lat', 'lng',
            'geofence_radius_meters', 'status', 'arrived_at', 'completed_at', 'notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'arrived_at', 'completed_at', 'created_at', 'updated_at']


class OrderRouteStopCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderRouteStop
        fields = [
            'sequence', 'stop_type', 'label', 'address', 'lat', 'lng',
            'geofence_radius_meters', 'notes',
        ]
        extra_kwargs = {'sequence': {'required': False}}


class OrderRouteOptimizeSerializer(serializers.Serializer):
    preference = serializers.ChoiceField(
        choices=['fastest', 'cheapest', 'balanced', 'no_toll'],
        required=False,
    )


class OrderRoutePlanSerializer(serializers.Serializer):
    points = serializers.ListField(child=serializers.DictField(), min_length=2)
    threshold_meters = serializers.IntegerField(required=False, min_value=50, max_value=5000, default=500)
    pickup_geofence_radius_meters = serializers.IntegerField(required=False, min_value=50, max_value=5000, default=300)
    destination_geofence_radius_meters = serializers.IntegerField(required=False, min_value=50, max_value=5000, default=300)

    def validate_points(self, value):
        normalized = []
        for idx, item in enumerate(value):
            lat = item.get('lat')
            lng = item.get('lng')
            if lat is None or lng is None:
                raise serializers.ValidationError(f'Point #{idx + 1} must include lat and lng')
            try:
                lat_f = float(lat)
                lng_f = float(lng)
            except (TypeError, ValueError):
                raise serializers.ValidationError(f'Point #{idx + 1} has invalid lat/lng')
            point = {'lat': lat_f, 'lng': lng_f}
            for key in ('type', 'label', 'address', 'id', 'sequence'):
                if key in item:
                    point[key] = item[key]
            normalized.append(point)
        return normalized


class OrderProofOfDeliveryCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderProofOfDelivery
        fields = [
            'receiver_name',
            'receiver_signature',
            'delivery_photo',
            'delivered_lat',
            'delivered_lng',
            'note',
        ]
        extra_kwargs = {
            'delivery_photo': {'required': True, 'allow_null': False},
            'receiver_signature': {'required': True, 'allow_blank': False},
        }


class OrderReturnQualitySerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderReturnQuality
        fields = [
            'quality_status',
            'photo',
            'note',
        ]


class OrderTrackingShareLinkCreateSerializer(serializers.Serializer):
    expires_in_hours = serializers.IntegerField(required=False, min_value=1, max_value=168, default=24)


class OrderCustodyEventSerializer(serializers.ModelSerializer):
    actor_name = serializers.SerializerMethodField()
    photo_url = serializers.SerializerMethodField()

    class Meta:
        model = OrderCustodyEvent
        fields = [
            'id', 'event_type', 'actor', 'actor_name', 'witness_name',
            'lat', 'lng', 'photo_url', 'qr_token', 'note', 'metadata', 'created_at',
        ]

    def get_actor_name(self, obj):
        return f'{obj.actor.first_name} {obj.actor.last_name}'.strip() or obj.actor.phone

    def get_photo_url(self, obj):
        if not obj.photo:
            return None
        request = self.context.get('request')
        if request:
            return request.build_absolute_uri(obj.photo.url)
        return obj.photo.url


class OrderCustodyEventCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = OrderCustodyEvent
        fields = ['event_type', 'witness_name', 'lat', 'lng', 'photo', 'note', 'metadata']


class OrderSOSAlertSerializer(serializers.ModelSerializer):
    driver_name = serializers.SerializerMethodField()

    class Meta:
        model = OrderSOSAlert
        fields = [
            'id', 'order', 'driver', 'driver_name', 'lat', 'lng', 'message',
            'status', 'acknowledged_by', 'acknowledged_at', 'resolved_at', 'created_at',
        ]

    def get_driver_name(self, obj):
        return f'{obj.driver.first_name} {obj.driver.last_name}'.strip() or obj.driver.phone


class SOSTriggerSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)
    message = serializers.CharField(required=False, allow_blank=True, max_length=500)
