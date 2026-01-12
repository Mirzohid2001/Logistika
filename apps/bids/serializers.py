from rest_framework import serializers
from .models import Bid
from apps.advertisements.models import Advertisement


class BidSerializer(serializers.ModelSerializer):
    current_amount = serializers.SerializerMethodField()
    can_counter_by_driver = serializers.SerializerMethodField()
    can_counter_by_client = serializers.SerializerMethodField()

    def get_current_amount(self, obj):
        return obj.get_current_amount()

    def get_can_counter_by_driver(self, obj):
        return obj.can_counter_offer_by_driver()

    def get_can_counter_by_client(self, obj):
        return obj.can_counter_offer_by_client()

    class Meta:
        model = Bid
        fields = ['id', 'advertisement', 'client', 'driver', 'is_driver_agreed_to_amount', 'proposed_amounts', 'is_rejected_by_client', 'is_accepted_by_client', 'is_rejected_by_driver', 'last_counter_by', 'current_amount', 'can_counter_by_driver', 'can_counter_by_client', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class BidCreateSerializer(serializers.Serializer):
    advertisement = serializers.PrimaryKeyRelatedField(queryset=Advertisement.objects.all())
    proposed_amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_advertisement(self, value):
        if value.is_closed:
            raise serializers.ValidationError("Advertisement is already closed")
        return value


class BidCounterOfferSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=12, decimal_places=2)

    def validate_amount(self, value):
        if value <= 0:
            raise serializers.ValidationError("Amount must be greater than zero")
        return value
