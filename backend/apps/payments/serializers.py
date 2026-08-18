from django.conf import settings
from rest_framework import serializers
from .models import Payment, PaymentHistory
from .checkout import extract_checkout_url


class PaymentHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = PaymentHistory
        fields = ['id', 'status', 'status_new', 'gateway_response', 'created_at']
        read_only_fields = ['id', 'created_at']


class PaymentSerializer(serializers.ModelSerializer):
    history = PaymentHistorySerializer(many=True, read_only=True)
    is_refunded = serializers.ReadOnlyField()
    refundable_amount = serializers.SerializerMethodField()
    checkout_url = serializers.SerializerMethodField()

    def get_refundable_amount(self, obj):
        return float(obj.refundable_amount)

    def get_checkout_url(self, obj):
        return extract_checkout_url(obj.gateway_response)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        include_history = self.context.get('include_history', False)
        if not include_history and 'history' in self.fields:
            self.fields.pop('history')
    
    class Meta:
        model = Payment
        fields = ['id', 'user', 'order', 'amount', 'currency', 'payment_method', 'payment_status', 
                  'transaction_id', 'gateway_response', 'checkout_url', 'created_at', 'updated_at', 'paid_at', 
                  'refunded_at', 'refund_amount', 'refund_reason', 'is_refunded', 'refundable_amount', 'history']
        read_only_fields = ['id', 'user', 'payment_status', 'transaction_id', 'gateway_response', 'checkout_url',
                           'created_at', 'updated_at', 'paid_at', 'refunded_at', 'refund_amount', 
                           'refund_reason', 'is_refunded', 'refundable_amount', 'history']


class PaymentCreateSerializer(serializers.Serializer):
    order_id = serializers.IntegerField(required=False, allow_null=True)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)
    currency = serializers.CharField(max_length=3, default='UZS', required=False)

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        choices = ['click', 'payme', 'uzum']
        if getattr(settings, 'PAYMENTS_ALLOW_MOCK', False):
            choices.append('mock')
        self.fields['payment_method'] = serializers.ChoiceField(choices=choices)


class PaymentRefundSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True, max_length=500)
    amount = serializers.DecimalField(max_digits=12, decimal_places=2, required=False, allow_null=True)
