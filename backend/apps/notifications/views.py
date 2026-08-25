from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Q
from .models import Notification
from .serializers import NotificationSerializer, NotificationPreferencesSerializer
from .preferences import get_user_preferences, update_user_preferences
from apps.common.openapi import EmptySerializer, MessageResponseSerializer, NotificationIdsRequestSerializer


class NotificationListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: NotificationSerializer(many=True)})
    def get(self, request):
        notifications = Notification.objects.filter(user=request.user).order_by('-created_at')
        
        is_read = request.query_params.get('is_read')
        if is_read is not None:
            notifications = notifications.filter(is_read=is_read.lower() == 'true')
        
        notification_type = request.query_params.get('type')
        if notification_type:
            notifications = notifications.filter(notification_type=notification_type)
        
        serializer = NotificationSerializer(notifications, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class NotificationDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: NotificationSerializer})
    def get(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
            serializer = NotificationSerializer(notification)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Notification.DoesNotExist:
            return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)


class NotificationMarkReadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=NotificationIdsRequestSerializer,
        responses={200: MessageResponseSerializer}
    )
    def post(self, request):
        notification_ids = request.data.get('notification_ids', [])
        
        if not notification_ids:
            return Response({'error': 'notification_ids is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        updated = Notification.objects.filter(
            id__in=notification_ids,
            user=request.user
        ).update(is_read=True)
        
        return Response({
            'message': f'{updated} notifications marked as read'
        }, status=status.HTTP_200_OK)


class NotificationMarkAllReadView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MessageResponseSerializer})
    def post(self, request):
        updated = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).update(is_read=True)
        
        return Response({
            'message': f'{updated} notifications marked as read'
        }, status=status.HTTP_200_OK)


class NotificationUnreadCountView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        unread_count = Notification.objects.filter(
            user=request.user,
            is_read=False
        ).count()
        
        return Response({
            'unread_count': unread_count
        }, status=status.HTTP_200_OK)


class NotificationPreferencesView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: NotificationPreferencesSerializer})
    def get(self, request):
        return Response(get_user_preferences(request.user), status=status.HTTP_200_OK)

    @extend_schema(request=NotificationPreferencesSerializer, responses={200: NotificationPreferencesSerializer})
    def patch(self, request):
        serializer = NotificationPreferencesSerializer(data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        updated = update_user_preferences(request.user, serializer.validated_data)
        return Response(updated, status=status.HTTP_200_OK)


class NotificationDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MessageResponseSerializer})
    def delete(self, request, pk):
        try:
            notification = Notification.objects.get(pk=pk, user=request.user)
            notification.delete()
            return Response({'message': 'Notification deleted'}, status=status.HTTP_200_OK)
        except Notification.DoesNotExist:
            return Response({'error': 'Notification not found'}, status=status.HTTP_404_NOT_FOUND)
