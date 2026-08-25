from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.core.cache import cache
from django.db.models import Q, Max, Count, OuterRef, Subquery, Prefetch
from django.db import transaction
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
from .models import Chat, Message
from apps.orders.models import Order
from apps.common.pagination import StandardResultsSetPagination
from apps.common.openapi import (
    ChatCreateRequestSerializer,
    EmptySerializer,
    MessageResponseSerializer,
    MessageReactionRequestSerializer,
    MessageTextRequestSerializer,
)
from apps.common.cache_utils import build_user_cache_key, bump_cache_version, get_cache_version
from apps.common.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionDeniedError,
    DatabaseError,
)
from .serializers import (
    ChatSerializer,
    ChatDetailSerializer,
    MessageSerializer,
    MessageCreateSerializer,
)
from apps.notifications.services import create_notification
from apps.users.permissions import can_access_order, can_access_chat
from .ws_auth import issue_ws_ticket

CHAT_LIST_CACHE_SCOPE = 'chats_list'
CHAT_LIST_CACHE_TTL = 30
logger = logging.getLogger(__name__)


def _invalidate_chat_list_cache(chat: Chat):
    bump_cache_version(CHAT_LIST_CACHE_SCOPE, 'global')
    user_ids = {chat.client_id, chat.driver_id}
    for user_id in user_ids:
        if user_id:
            bump_cache_version(CHAT_LIST_CACHE_SCOPE, user_id)


class ChatListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ChatSerializer(many=True)})
    def get(self, request):
        page = request.query_params.get('page', '1')
        page_size = request.query_params.get('page_size', '20')
        cache_key = build_user_cache_key(
            CHAT_LIST_CACHE_SCOPE,
            request.user.id,
            {
                'global_version': get_cache_version(CHAT_LIST_CACHE_SCOPE, 'global'),
                'page': page,
                'page_size': page_size,
                'role': 'staff' if (request.user.is_dispatcher or request.user.is_updater) else 'regular',
            },
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload, status=status.HTTP_200_OK)

        last_message_qs = Message.objects.filter(
            chat=OuterRef('pk'),
            is_deleted=False
        ).order_by('-created_at')

        if request.user.is_dispatcher or request.user.is_updater:
            chats = Chat.objects.all().annotate(
                last_message_time=Max('messages__created_at'),
                last_message_text=Subquery(last_message_qs.values('text')[:1]),
                last_message_type=Subquery(last_message_qs.values('message_type')[:1]),
                last_message_file_name=Subquery(last_message_qs.values('file_name')[:1]),
                last_message_contact_name=Subquery(last_message_qs.values('contact_name')[:1]),
                last_message_created_at=Subquery(last_message_qs.values('created_at')[:1]),
                last_message_sender_id=Subquery(last_message_qs.values('sender_id')[:1]),
                unread_count_annotated=Count('messages', filter=Q(messages__is_read=False) & ~Q(messages__sender=request.user)),
            ).select_related('client', 'driver', 'order', 'order__advertisement')
        else:
            chats = Chat.objects.filter(
                Q(client=request.user) | Q(driver=request.user)
            ).annotate(
                last_message_time=Max('messages__created_at'),
                last_message_text=Subquery(last_message_qs.values('text')[:1]),
                last_message_type=Subquery(last_message_qs.values('message_type')[:1]),
                last_message_file_name=Subquery(last_message_qs.values('file_name')[:1]),
                last_message_contact_name=Subquery(last_message_qs.values('contact_name')[:1]),
                last_message_created_at=Subquery(last_message_qs.values('created_at')[:1]),
                last_message_sender_id=Subquery(last_message_qs.values('sender_id')[:1]),
                unread_count_annotated=Count('messages', filter=Q(messages__is_read=False) & ~Q(messages__sender=request.user)),
            ).select_related('client', 'driver', 'order', 'order__advertisement')

        chats = chats.order_by('-last_message_time', '-updated_at', '-id')

        paginator = StandardResultsSetPagination()
        page_queryset = paginator.paginate_queryset(chats, request)
        serializer = ChatSerializer(page_queryset, many=True, context={'request': request})
        payload = paginator.get_paginated_response(serializer.data).data
        cache.set(cache_key, payload, CHAT_LIST_CACHE_TTL)
        return Response(payload, status=status.HTTP_200_OK)


class ChatDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ChatDetailSerializer})
    def get(self, request, pk):
        messages_prefetch = Prefetch(
            'messages',
            queryset=Message.objects.select_related('sender', 'reply_to', 'reply_to__sender').order_by('created_at')
        )

        if request.user.is_dispatcher or request.user.is_updater:
            chat = Chat.objects.select_related('client', 'driver', 'order', 'order__advertisement').prefetch_related(messages_prefetch).filter(pk=pk).first()
        else:
            chat = Chat.objects.select_related('client', 'driver', 'order', 'order__advertisement').prefetch_related(messages_prefetch).filter(
                pk=pk
            ).filter(
                Q(client=request.user) | Q(driver=request.user)
            ).first()
        
        if not chat:
            return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
        
        Message.objects.filter(
            chat=chat,
            is_read=False
        ).exclude(sender=request.user).update(is_read=True)
        
        serializer = ChatDetailSerializer(chat, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ChatCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=ChatCreateRequestSerializer,
        responses={201: ChatSerializer}
    )
    def post(self, request):
        order_id = request.data.get('order_id')
        
        if not order_id:
            return Response({'error': 'order_id is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if not can_access_order(request.user, order):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        chat, created = Chat.objects.get_or_create(
            order=order,
            client=order.client,
            driver=order.driver,
        )
        _invalidate_chat_list_cache(chat)
        
        serializer = ChatSerializer(chat, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class WebSocketTicketView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: {'type': 'object', 'properties': {
            'ticket': {'type': 'string'},
            'expires_in': {'type': 'integer'},
        }}}
    )
    def post(self, request):
        ticket, expires_in = issue_ws_ticket(user_id=request.user.id)
        return Response({
            'ticket': ticket,
            'expires_in': expires_in,
        }, status=status.HTTP_200_OK)


class MessageCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=MessageCreateSerializer,
        responses={201: MessageSerializer}
    )
    def post(self, request, chat_id):
        try:
            serializer = MessageCreateSerializer(data=request.data)
            if not serializer.is_valid():
                raise ValidationError(detail=serializer.errors)
            
            # Find chat with proper permissions
            chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
            
            if not chat or not can_access_chat(request.user, chat):
                raise NotFoundError(detail='Chat topilmadi')
            
            # Handle reply_to message
            reply_to = None
            if serializer.validated_data.get('reply_to'):
                try:
                    reply_to = Message.objects.get(
                        id=serializer.validated_data['reply_to'],
                        chat=chat
                    )
                except Message.DoesNotExist:
                    # Reply message not found, but continue without reply
                    pass
            
            # Create message within transaction
            with transaction.atomic():
                message = Message.objects.create(
                    chat=chat,
                    sender=request.user,
                    text=serializer.validated_data.get('text', ''),
                    message_type=serializer.validated_data.get('message_type', Message.MESSAGE_TYPE_TEXT),
                    reply_to=reply_to,
                    location_lat=serializer.validated_data.get('location_lat'),
                    location_lng=serializer.validated_data.get('location_lng'),
                    location_address=serializer.validated_data.get('location_address', ''),
                    contact_name=serializer.validated_data.get('contact_name', ''),
                    contact_phone=serializer.validated_data.get('contact_phone', ''),
                )
                
                chat.save()
                _invalidate_chat_list_cache(chat)
            
            message_data = MessageSerializer(message).data
            
            # Send via WebSocket
            try:
                channel_layer = get_channel_layer()
                if channel_layer:
                    async_to_sync(channel_layer.group_send)(
                        f'chat_{chat_id}',
                        {
                            'type': 'chat_message',
                            'message': message_data,
                        }
                    )
            except Exception:
                logger.exception(
                    'Failed to broadcast chat message over WebSocket',
                    extra={'event': 'chat_ws_broadcast_failed'},
                )
            
            # Send notification
            try:
                recipient = chat.client if request.user == chat.driver else chat.driver
                if recipient and recipient != request.user:
                    sender_name = f"{request.user.first_name} {request.user.last_name}"
                    preview = message.text[:50] if message.text else ''
                    if message.message_type == Message.MESSAGE_TYPE_IMAGE:
                        preview = '📷 Rasm'
                    elif message.message_type == Message.MESSAGE_TYPE_FILE:
                        preview = f'📎 {message.file_name or "Fayl"}'
                    elif message.message_type == Message.MESSAGE_TYPE_VOICE:
                        preview = '🎤 Ovozli xabar'
                    elif message.message_type == Message.MESSAGE_TYPE_LOCATION:
                        preview = '📍 Joylashuv'
                    elif message.message_type == Message.MESSAGE_TYPE_CONTACT:
                        preview = f'👤 {message.contact_name or "Kontakt"}'
                    
                    create_notification(
                        user=recipient,
                        notification_type='message_received',
                        title='Yangi xabar',
                        message=f"{sender_name}: {preview}{'...' if len(preview) > 50 else ''}",
                        order=chat.order,
                        extra_push_data={'chat_id': chat.id},
                    )
            except Exception:
                logger.exception(
                    'Failed to create chat message notification',
                    extra={'event': 'chat_notify_failed'},
                )
            
            return Response(message_data, status=status.HTTP_201_CREATED)
        except (ValidationError, NotFoundError, PermissionDeniedError):
            raise
        except Exception as e:
            raise DatabaseError(detail=f'Xabar yaratishda xatolik: {str(e)}')



class MessageMarkReadView(APIView):
    serializer_class = EmptySerializer
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MessageResponseSerializer})
    def post(self, request, chat_id):
        chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
        
        if not chat or not can_access_chat(request.user, chat):
            return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
        
        Message.objects.filter(
            chat=chat,
            is_read=False
        ).exclude(sender=request.user).update(is_read=True)
        _invalidate_chat_list_cache(chat)
        
        return Response({'message': 'Messages marked as read'}, status=status.HTTP_200_OK)


class MessageUpdateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=MessageTextRequestSerializer,
        responses={200: MessageSerializer}
    )
    def patch(self, request, message_id):
        try:
            message = Message.objects.get(pk=message_id, sender=request.user)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
        
        if message.is_deleted:
            return Response({'error': 'Cannot edit deleted message'}, status=status.HTTP_400_BAD_REQUEST)
        
        text = request.data.get('text', '')
        if not text:
            return Response({'error': 'Text is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        message.text = text
        message.is_edited = True
        message.save()
        _invalidate_chat_list_cache(message.chat)
        
        return Response(MessageSerializer(message).data, status=status.HTTP_200_OK)


class MessageDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: MessageResponseSerializer})
    def delete(self, request, message_id):
        try:
            message = Message.objects.get(pk=message_id, sender=request.user)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
        
        message.is_deleted = True
        message.text = ''
        message.save()
        _invalidate_chat_list_cache(message.chat)
        
        return Response({'message': 'Message deleted'}, status=status.HTTP_200_OK)


class MessageReactionView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=MessageReactionRequestSerializer,
        responses={200: MessageSerializer}
    )
    def post(self, request, message_id):
        try:
            message = Message.objects.select_related('chat', 'chat__order').get(pk=message_id)
        except Message.DoesNotExist:
            return Response({'error': 'Message not found'}, status=status.HTTP_404_NOT_FOUND)
        if not can_access_chat(request.user, message.chat):
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
        
        reaction = request.data.get('reaction', '')
        if not reaction:
            return Response({'error': 'Reaction is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not message.reactions:
            message.reactions = {}
        
        user_id = str(request.user.id)
        if user_id in message.reactions and message.reactions[user_id] == reaction:
            del message.reactions[user_id]
        else:
            message.reactions[user_id] = reaction
        
        message.save()
        _invalidate_chat_list_cache(message.chat)
        
        return Response(MessageSerializer(message).data, status=status.HTTP_200_OK)


class MessageSearchView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[{'name': 'q', 'in': 'query', 'required': True, 'schema': {'type': 'string'}}],
        responses={200: MessageSerializer(many=True)}
    )
    def get(self, request, chat_id):
        query = request.query_params.get('q', '')
        if not query:
            return Response({'error': 'Query parameter q is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
        
        if not chat or not can_access_chat(request.user, chat):
            return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
        
        messages = Message.objects.filter(
            chat=chat,
            is_deleted=False,
            text__icontains=query
        ).order_by('-created_at')[:50]
        
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)
