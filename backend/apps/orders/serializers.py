from rest_framework import serializers
from .models import (
    Order,
    OrderStatus,
    OrderLocationTrack,
    OrderProofOfDelivery,
    OrderReturnQuality,
    OrderTrackingShareLink,
)
from apps.common.services import get_language_from_request
from apps.users.serializers import UserSerializer


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

    class Meta:
        model = Order
        fields = ['id', 'advertisement', 'driver', 'client', 'status', 'current_location_lat', 'current_location_lng', 
                  'planned_route_points', 'route_deviation_threshold_meters', 'route_deviation_last_alert_at',
                  'route_deviation_last_distance_meters', 'route_deviation_count',
                  'pickup_geofence_radius_meters', 'destination_geofence_radius_meters',
                  'is_in_pickup_geofence', 'is_in_destination_geofence',
                  'pickup_entered_at', 'pickup_exited_at', 'destination_entered_at',
                  'eta_share_enabled', 'eta_share_expires_at',
                  'proof_of_delivery', 'return_quality', 'tracking_share',
                  'total_amount', 'paid_amount', 'remaining_amount', 'is_fully_paid', 'payment_progress',
                  'created_at', 'updated_at', 'started_at', 'completed_at']
        read_only_fields = ['id', 'created_at', 'updated_at', 'total_amount', 'paid_amount', 'remaining_amount', 'is_fully_paid', 'payment_progress']

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
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)


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
            normalized.append({'lat': lat_f, 'lng': lng_f})
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

