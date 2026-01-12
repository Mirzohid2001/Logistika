from rest_framework import serializers
from .models import Order, OrderStatus, OrderLocationTrack
from apps.common.services import get_language_from_request


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
    status = OrderStatusSerializer(read_only=True)

    class Meta:
        model = Order
        fields = ['id', 'advertisement', 'driver', 'client', 'status', 'current_location_lat', 'current_location_lng', 'created_at', 'updated_at', 'started_at', 'completed_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class OrderLocationUpdateSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)

