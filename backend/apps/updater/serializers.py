from rest_framework import serializers
from .models import UpdateLog
from apps.orders.serializers import OrderSerializer
from apps.users.serializers import UserSerializer


class UpdateLogSerializer(serializers.ModelSerializer):
    updater = UserSerializer(read_only=True)
    order = OrderSerializer(read_only=True)
    
    class Meta:
        model = UpdateLog
        fields = ['id', 'updater', 'order', 'update_type', 'old_value', 'new_value', 'description', 'created_at']
        read_only_fields = ['id', 'updater', 'created_at']


class UpdateStatusSerializer(serializers.Serializer):
    status_code = serializers.CharField(max_length=50)
    description = serializers.CharField(required=False, allow_blank=True)


class UpdateLocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)
    description = serializers.CharField(required=False, allow_blank=True)


class UpdatePaymentSerializer(serializers.Serializer):
    payment_status = serializers.CharField(max_length=50)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False)
    description = serializers.CharField(required=False, allow_blank=True)


class BulkUpdateSerializer(serializers.Serializer):
    status_code = serializers.CharField(max_length=50, required=False)
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False)
    payment_status = serializers.CharField(max_length=50, required=False)
    description = serializers.CharField(required=False, allow_blank=True)
