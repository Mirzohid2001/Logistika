from rest_framework import serializers
from .models import Notification
from apps.orders.serializers import OrderSerializer


class NotificationSerializer(serializers.ModelSerializer):
    order = OrderSerializer(read_only=True)

    class Meta:
        model = Notification
        fields = [
            'id',
            'user',
            'order',
            'notification_type',
            'title',
            'message',
            'is_read',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
