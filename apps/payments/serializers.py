from rest_framework import serializers
from .models import Payment, PaymentHistory


class PaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Payment
        fields = ['id', 'user', 'order', 'amount', 'currency', 'payment_method', 'payment_status', 'transaction_id', 'gateway_response', 'created_at', 'updated_at', 'paid_at']
        read_only_fields = ['id', 'user', 'payment_status', 'transaction_id', 'gateway_response', 'created_at', 'updated_at', 'paid_at']


class PaymentCreateSerializer(serializers.Serializer):
    order_id = serializers.IntegerField(required=False)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    payment_method = serializers.ChoiceField(choices=['click', 'payme', 'uzum'])


class PaymentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentHistory
        fields = ['id', 'payment', 'status', 'status_new', 'gateway_response', 'created_at']

