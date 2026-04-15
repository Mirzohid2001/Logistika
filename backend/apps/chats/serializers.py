from rest_framework import serializers
from apps.users.models import User
from apps.orders.models import Order
from .models import Chat, Message


class UserShortSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'first_name', 'last_name', 'phone', 'avatar']


class OrderShortSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    
    def get_title(self, obj):
        if hasattr(obj, 'advertisement') and obj.advertisement:
            return obj.advertisement.title_ru if hasattr(obj.advertisement, 'title_ru') else str(obj.advertisement)
        return f"Order {obj.id}"
    
    class Meta:
        model = Order
        fields = ['id', 'title']


class MessageReplySerializer(serializers.ModelSerializer):
    sender = UserShortSerializer(read_only=True)
    
    class Meta:
        model = Message
        fields = ['id', 'sender', 'text', 'message_type', 'created_at']
        read_only_fields = ['id', 'sender', 'created_at']


class MessageSerializer(serializers.ModelSerializer):
    sender = UserShortSerializer(read_only=True)
    reply_to = MessageReplySerializer(read_only=True)
    image = serializers.SerializerMethodField()
    file = serializers.SerializerMethodField()
    voice = serializers.SerializerMethodField()
    
    def get_image(self, obj):
        if obj.image:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.image.url)
            return obj.image.url
        return None
    
    def get_file(self, obj):
        if obj.file:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.file.url)
            return obj.file.url
        return None
    
    def get_voice(self, obj):
        if obj.voice:
            request = self.context.get('request')
            if request:
                return request.build_absolute_uri(obj.voice.url)
            return obj.voice.url
        return None
    
    class Meta:
        model = Message
        fields = [
            'id', 'sender', 'text', 'message_type', 'is_read', 'is_edited', 'is_deleted',
            'reply_to', 'created_at', 'updated_at',
            'image', 'file', 'voice', 'file_name', 'file_size',
            'location_lat', 'location_lng', 'location_address',
            'contact_name', 'contact_phone',
            'reactions'
        ]
        read_only_fields = ['id', 'sender', 'is_read', 'is_edited', 'is_deleted', 'created_at', 'updated_at']


class MessageCreateSerializer(serializers.Serializer):
    text = serializers.CharField(max_length=5000, required=False, allow_blank=True)
    message_type = serializers.ChoiceField(choices=Message.MESSAGE_TYPES, default=Message.MESSAGE_TYPE_TEXT)
    reply_to = serializers.IntegerField(required=False, allow_null=True)
    location_lat = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    location_lng = serializers.DecimalField(max_digits=9, decimal_places=6, required=False, allow_null=True)
    location_address = serializers.CharField(max_length=500, required=False, allow_blank=True)
    contact_name = serializers.CharField(max_length=255, required=False, allow_blank=True)
    contact_phone = serializers.CharField(max_length=20, required=False, allow_blank=True)


class ChatSerializer(serializers.ModelSerializer):
    client = UserShortSerializer(read_only=True)
    driver = UserShortSerializer(read_only=True)
    order = OrderShortSerializer(read_only=True)
    last_message = serializers.SerializerMethodField()
    unread_count = serializers.SerializerMethodField()
    
    def get_last_message(self, obj):
        annotated_type = getattr(obj, 'last_message_type', None)
        if annotated_type:
            preview_text = ''
            if annotated_type == Message.MESSAGE_TYPE_IMAGE:
                preview_text = '📷 Rasm'
            elif annotated_type == Message.MESSAGE_TYPE_FILE:
                preview_text = f'📎 {getattr(obj, "last_message_file_name", None) or "Fayl"}'
            elif annotated_type == Message.MESSAGE_TYPE_VOICE:
                preview_text = '🎤 Ovozli xabar'
            elif annotated_type == Message.MESSAGE_TYPE_LOCATION:
                preview_text = '📍 Joylashuv'
            elif annotated_type == Message.MESSAGE_TYPE_CONTACT:
                preview_text = f'👤 {getattr(obj, "last_message_contact_name", None) or "Kontakt"}'
            else:
                text = getattr(obj, 'last_message_text', '') or ''
                preview_text = text[:100]

            return {
                'text': preview_text,
                'message_type': annotated_type,
                'created_at': getattr(obj, 'last_message_created_at', None),
                'sender_id': getattr(obj, 'last_message_sender_id', None),
            }

        last_msg = obj.messages.filter(is_deleted=False).last()
        if last_msg:
            preview_text = ''
            if last_msg.message_type == Message.MESSAGE_TYPE_IMAGE:
                preview_text = '📷 Rasm'
            elif last_msg.message_type == Message.MESSAGE_TYPE_FILE:
                preview_text = f'📎 {last_msg.file_name or "Fayl"}'
            elif last_msg.message_type == Message.MESSAGE_TYPE_VOICE:
                preview_text = '🎤 Ovozli xabar'
            elif last_msg.message_type == Message.MESSAGE_TYPE_LOCATION:
                preview_text = '📍 Joylashuv'
            elif last_msg.message_type == Message.MESSAGE_TYPE_CONTACT:
                preview_text = f'👤 {last_msg.contact_name or "Kontakt"}'
            else:
                preview_text = last_msg.text[:100] if last_msg.text else ''
            
            return {
                'text': preview_text,
                'message_type': last_msg.message_type,
                'created_at': last_msg.created_at,
                'sender_id': last_msg.sender.id,
            }
        return None
    
    def get_unread_count(self, obj):
        annotated_unread_count = getattr(obj, 'unread_count_annotated', None)
        if annotated_unread_count is not None:
            return annotated_unread_count

        request = self.context.get('request')
        if request and request.user:
            return obj.messages.filter(is_read=False).exclude(sender=request.user).count()
        return 0
    
    class Meta:
        model = Chat
        fields = ['id', 'order', 'client', 'driver', 'last_message', 'unread_count', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class ChatDetailSerializer(ChatSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    
    class Meta(ChatSerializer.Meta):
        fields = ChatSerializer.Meta.fields + ['messages']
