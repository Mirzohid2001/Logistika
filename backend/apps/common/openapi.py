from rest_framework import serializers


class EmptySerializer(serializers.Serializer):
    """Explicitly documents endpoints that do not accept or return a body."""

    pass


class MessageResponseSerializer(serializers.Serializer):
    message = serializers.CharField()


class NotificationIdsRequestSerializer(serializers.Serializer):
    notification_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)


class PasswordResetRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    new_password = serializers.CharField(write_only=True, min_length=8)
    new_password_confirm = serializers.CharField(write_only=True, min_length=8)
    sms_code = serializers.CharField(write_only=True)


class PhoneRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()


class NoteRequestSerializer(serializers.Serializer):
    note = serializers.CharField()


class DispatcherBulkRequestSerializer(serializers.Serializer):
    order_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    action = serializers.ChoiceField(choices=('assign', 'cancel', 'reassign'))
    driver_id = serializers.IntegerField(required=False)
    notes = serializers.CharField(required=False, allow_blank=True)


class PayoutRequestSerializer(serializers.Serializer):
    amount = serializers.DecimalField(max_digits=14, decimal_places=2)
    bank_details = serializers.CharField(required=False, allow_blank=True)


class UpdaterBulkRequestSerializer(serializers.Serializer):
    order_ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
    action = serializers.ChoiceField(choices=('update_status', 'update_location', 'update_payment'))
    status_code = serializers.CharField(required=False)
    lat = serializers.FloatField(required=False)
    lng = serializers.FloatField(required=False)
    payment_status = serializers.CharField(required=False)
    description = serializers.CharField(required=False, allow_blank=True)


class ReceivedRequestSerializer(serializers.Serializer):
    received = serializers.BooleanField()


class PaidRequestSerializer(serializers.Serializer):
    paid = serializers.BooleanField()


class ReasonRequestSerializer(serializers.Serializer):
    reason = serializers.CharField(required=False, allow_blank=True)


class QRCodeRequestSerializer(serializers.Serializer):
    qr_code = serializers.CharField()


class ChatCreateRequestSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()


class MessageTextRequestSerializer(serializers.Serializer):
    text = serializers.CharField()


class MessageReactionRequestSerializer(serializers.Serializer):
    reaction = serializers.CharField(required=False, allow_blank=True)


class MessageImageUploadRequestSerializer(serializers.Serializer):
    image = serializers.ImageField()
    chat_id = serializers.IntegerField()


class MessageFileUploadRequestSerializer(serializers.Serializer):
    file = serializers.FileField()
    chat_id = serializers.IntegerField()


class MessageVoiceUploadRequestSerializer(serializers.Serializer):
    voice = serializers.FileField()
    chat_id = serializers.IntegerField()
