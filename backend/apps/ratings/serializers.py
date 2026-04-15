from rest_framework import serializers
from .models import Rating
from apps.users.serializers import UserSerializer
from apps.orders.serializers import OrderSerializer


class RatingSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)
    order = OrderSerializer(read_only=True)
    
    class Meta:
        model = Rating
        fields = ['id', 'order', 'from_user', 'to_user', 'rating', 'comment', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class RatingCreateSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    to_user_id = serializers.IntegerField()
    rating = serializers.IntegerField(min_value=1, max_value=5)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=1000)
    
    def validate(self, attrs):
        from apps.orders.models import Order
        from apps.users.models import User
        
        order_id = attrs.get('order_id')
        to_user_id = attrs.get('to_user_id')
        
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            raise serializers.ValidationError({'order_id': 'Order not found'})
        
        try:
            to_user = User.objects.get(pk=to_user_id)
        except User.DoesNotExist:
            raise serializers.ValidationError({'to_user_id': 'User not found'})
        
        if order.driver != to_user and order.client != to_user:
            raise serializers.ValidationError({'to_user_id': 'User is not related to this order'})
        
        return attrs
