from rest_framework import serializers
from .models import Rating, Complaint
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


class ComplaintSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Complaint
        fields = [
            'id', 'order_id', 'from_user', 'to_user', 'category', 'category_display',
            'description', 'status', 'status_display', 'created_at', 'updated_at',
        ]
        read_only_fields = fields


class ComplaintCreateSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    to_user_id = serializers.IntegerField()
    category = serializers.ChoiceField(choices=Complaint.CATEGORY_CHOICES, default='other')
    description = serializers.CharField(min_length=10, max_length=2000)


class ComplaintStaffSerializer(serializers.ModelSerializer):
    from_user = UserSerializer(read_only=True)
    to_user = UserSerializer(read_only=True)
    order_id = serializers.IntegerField(source='order.id', read_only=True)
    category_display = serializers.CharField(source='get_category_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = Complaint
        fields = [
            'id', 'order_id', 'from_user', 'to_user', 'category', 'category_display',
            'description', 'status', 'status_display', 'admin_notes',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'order_id', 'from_user', 'to_user', 'category', 'category_display',
            'description', 'created_at', 'updated_at',
        ]


class ComplaintResolveSerializer(serializers.Serializer):
    status = serializers.ChoiceField(
        choices=[('in_review', 'In review'), ('resolved', 'Resolved'), ('dismissed', 'Dismissed')],
    )
    admin_notes = serializers.CharField(required=False, allow_blank=True, max_length=2000)
    action = serializers.ChoiceField(
        choices=[
            ('none', 'No action'),
            ('warn', 'Warning'),
            ('suspend_7', 'Suspend 7 days'),
            ('suspend_30', 'Suspend 30 days'),
            ('block', 'Block account'),
        ],
        required=False,
        default='none',
    )
    settlement = serializers.ChoiceField(
        choices=[
            ('release', 'Release to driver'),
            ('refund', 'Refund to client'),
            ('split', 'Split'),
        ],
        required=False,
        default='release',
    )
    driver_share = serializers.DecimalField(
        max_digits=12,
        decimal_places=2,
        required=False,
        allow_null=True,
    )
