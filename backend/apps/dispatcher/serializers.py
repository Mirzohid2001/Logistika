from rest_framework import serializers
from .models import DispatcherAssignment, DispatcherNote, DispatcherExceptionAction
from apps.orders.serializers import OrderSerializer
from apps.users.serializers import UserSerializer


class DispatcherNoteSerializer(serializers.ModelSerializer):
    dispatcher = UserSerializer(read_only=True)
    
    class Meta:
        model = DispatcherNote
        fields = ['id', 'dispatcher', 'order', 'note', 'created_at']
        read_only_fields = ['id', 'dispatcher', 'created_at']


class DispatcherAssignmentSerializer(serializers.ModelSerializer):
    dispatcher = UserSerializer(read_only=True)
    assigned_driver = UserSerializer(read_only=True)
    order = OrderSerializer(read_only=True)
    
    class Meta:
        model = DispatcherAssignment
        fields = ['id', 'dispatcher', 'order', 'assigned_driver', 'assigned_at', 'reassigned_at', 'status', 'notes', 'created_at', 'updated_at']
        read_only_fields = ['id', 'dispatcher', 'assigned_at', 'reassigned_at', 'created_at', 'updated_at']


class DispatcherAssignmentCreateSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    driver_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True)


class DispatcherAssignmentReassignSerializer(serializers.Serializer):
    driver_id = serializers.IntegerField()
    notes = serializers.CharField(required=False, allow_blank=True)


class DispatcherExceptionActionSerializer(serializers.ModelSerializer):
    class Meta:
        model = DispatcherExceptionAction
        fields = [
            'id',
            'dispatcher',
            'order',
            'exception_type',
            'acknowledged_at',
            'snoozed_until',
            'note',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'dispatcher', 'created_at', 'updated_at']


class DispatcherExceptionAcknowledgeSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    exception_type = serializers.ChoiceField(choices=DispatcherExceptionAction.EXCEPTION_TYPE_CHOICES)
    note = serializers.CharField(required=False, allow_blank=True)


class DispatcherExceptionSnoozeSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
    exception_type = serializers.ChoiceField(choices=DispatcherExceptionAction.EXCEPTION_TYPE_CHOICES)
    minutes = serializers.IntegerField(required=False, min_value=1, max_value=24 * 60, default=30)
    note = serializers.CharField(required=False, allow_blank=True)


class DispatcherSuggestionAssignSerializer(serializers.Serializer):
    order_id = serializers.IntegerField()
