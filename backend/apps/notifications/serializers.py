from rest_framework import serializers
from .models import Notification
from apps.orders.serializers import OrderSerializer


class NotificationAdvertisementSerializer(serializers.Serializer):
    id = serializers.IntegerField()


class NotificationSerializer(serializers.ModelSerializer):
    order = OrderSerializer(read_only=True)
    advertisement = serializers.SerializerMethodField()
    chat_id = serializers.SerializerMethodField()

    class Meta:
        model = Notification
        fields = [
            'id',
            'user',
            'order',
            'advertisement',
            'chat_id',
            'notification_type',
            'title',
            'message',
            'is_read',
            'created_at',
        ]

    def get_chat_id(self, obj):
        if obj.notification_type != 'message_received' or not obj.order_id:
            return None
        from apps.chats.models import Chat

        chat = Chat.objects.filter(order_id=obj.order_id).order_by('-updated_at').first()
        return chat.id if chat else None

    def get_advertisement(self, obj):
        if obj.advertisement_id:
            return {'id': obj.advertisement_id}

        if obj.notification_type in ('bid_received', 'system') and obj.title == 'Yangi taklif':
            from apps.bids.models import Bid
            from datetime import timedelta

            window_start = obj.created_at - timedelta(minutes=5)
            window_end = obj.created_at + timedelta(minutes=5)
            bid = (
                Bid.objects.filter(
                    client=obj.user,
                    created_at__range=(window_start, window_end),
                )
                .order_by('-created_at')
                .first()
            )
            if bid:
                return {'id': bid.advertisement_id}

        return None


class NotificationTypePreferenceSerializer(serializers.Serializer):
    push_enabled = serializers.BooleanField(required=False)
    in_app_enabled = serializers.BooleanField(required=False)


class NotificationPreferencesSerializer(serializers.Serializer):
    push_enabled = serializers.BooleanField(required=False)
    in_app_enabled = serializers.BooleanField(required=False)
    types = serializers.DictField(
        child=NotificationTypePreferenceSerializer(),
        required=False,
    )
