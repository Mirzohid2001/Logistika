from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from .models import Chat, Message
from .serializers import MessageSerializer
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import logging
from apps.common.cache_utils import bump_cache_version
from apps.users.permissions import can_access_chat

logger = logging.getLogger(__name__)

CHAT_LIST_CACHE_SCOPE = 'chats_list'
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024
ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}


def _invalidate_chat_list_cache(chat: Chat):
    bump_cache_version(CHAT_LIST_CACHE_SCOPE, 'global')
    for user_id in {chat.client_id, chat.driver_id}:
        if user_id:
            bump_cache_version(CHAT_LIST_CACHE_SCOPE, user_id)


def _validate_file_size(uploaded_file, max_size_bytes: int, label: str):
    if uploaded_file and uploaded_file.size > max_size_bytes:
        max_mb = max_size_bytes // (1024 * 1024)
        return Response(
            {'error': f'{label} hajmi {max_mb}MB dan oshmasligi kerak'},
            status=status.HTTP_400_BAD_REQUEST
        )
    return None


class MessageImageUploadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'image': 'file', 'chat_id': 'integer'},
        responses={201: MessageSerializer}
    )
    def post(self, request):
        try:
            chat_id = request.POST.get('chat_id') or (request.data.get('chat_id') if hasattr(request, 'data') and request.data else None)
            image = request.FILES.get('image')
            
            logger.info(f'Image upload request - chat_id: {chat_id}, image: {image}, POST keys: {list(request.POST.keys())}, FILES keys: {list(request.FILES.keys())}')
            
            if not chat_id or not image:
                return Response({
                    'error': 'chat_id and image are required',
                    'debug': {
                        'chat_id': chat_id,
                        'has_image': bool(image),
                        'post_keys': list(request.POST.keys()),
                        'files_keys': list(request.FILES.keys())
                    }
                }, status=status.HTTP_400_BAD_REQUEST)

            size_error = _validate_file_size(image, MAX_IMAGE_SIZE_BYTES, 'Rasm')
            if size_error:
                return size_error

            content_type = (getattr(image, 'content_type', '') or '').lower()
            if content_type and content_type not in ALLOWED_IMAGE_TYPES:
                return Response(
                    {'error': 'Rasm formati qo\'llab-quvvatlanmaydi. Faqat JPG, PNG yoki WEBP yuboring'},
                    status=status.HTTP_400_BAD_REQUEST
                )
            
            try:
                chat_id = int(chat_id)
            except (ValueError, TypeError):
                return Response({'error': 'Invalid chat_id'}, status=status.HTTP_400_BAD_REQUEST)
            
            chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
            
            if not chat or not can_access_chat(request.user, chat):
                return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
            
            message = Message.objects.create(
                chat=chat,
                sender=request.user,
                message_type=Message.MESSAGE_TYPE_IMAGE,
                image=image,
            )
            
            chat.save()
            _invalidate_chat_list_cache(chat)
            
            message_data = MessageSerializer(message, context={'request': request}).data
            
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
            except Exception as e:
                logger.warning(f'Failed to send WebSocket message: {e}')
            
            return Response(message_data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f'Error uploading image: {e}', exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MessageFileUploadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'file': 'file', 'chat_id': 'integer'},
        responses={201: MessageSerializer}
    )
    def post(self, request):
        try:
            chat_id = request.POST.get('chat_id') or (request.data.get('chat_id') if hasattr(request, 'data') and request.data else None)
            file = request.FILES.get('file')
            
            if not chat_id or not file:
                return Response({'error': 'chat_id and file are required'}, status=status.HTTP_400_BAD_REQUEST)

            size_error = _validate_file_size(file, MAX_FILE_SIZE_BYTES, 'Fayl')
            if size_error:
                return size_error
            
            try:
                chat_id = int(chat_id)
            except (ValueError, TypeError):
                return Response({'error': 'Invalid chat_id'}, status=status.HTTP_400_BAD_REQUEST)
            
            chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
            
            if not chat or not can_access_chat(request.user, chat):
                return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
            
            message = Message.objects.create(
                chat=chat,
                sender=request.user,
                message_type=Message.MESSAGE_TYPE_FILE,
                file=file,
                file_name=file.name,
                file_size=file.size,
            )
            
            chat.save()
            _invalidate_chat_list_cache(chat)
            
            message_data = MessageSerializer(message, context={'request': request}).data
            
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
            except Exception as e:
                logger.warning(f'Failed to send WebSocket message: {e}')
            
            return Response(message_data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f'Error uploading file: {e}', exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MessageVoiceUploadView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'voice': 'file', 'chat_id': 'integer'},
        responses={201: MessageSerializer}
    )
    def post(self, request):
        try:
            chat_id = request.POST.get('chat_id') or (request.data.get('chat_id') if hasattr(request, 'data') and request.data else None)
            voice = request.FILES.get('voice')
            
            if not chat_id or not voice:
                return Response({'error': 'chat_id and voice are required'}, status=status.HTTP_400_BAD_REQUEST)

            size_error = _validate_file_size(voice, MAX_FILE_SIZE_BYTES, 'Ovozli fayl')
            if size_error:
                return size_error
            
            try:
                chat_id = int(chat_id)
            except (ValueError, TypeError):
                return Response({'error': 'Invalid chat_id'}, status=status.HTTP_400_BAD_REQUEST)
            
            chat = Chat.objects.select_related('order').filter(pk=chat_id).first()
            
            if not chat or not can_access_chat(request.user, chat):
                return Response({'error': 'Chat not found'}, status=status.HTTP_404_NOT_FOUND)
            
            message = Message.objects.create(
                chat=chat,
                sender=request.user,
                message_type=Message.MESSAGE_TYPE_VOICE,
                voice=voice,
            )
            
            chat.save()
            _invalidate_chat_list_cache(chat)
            
            message_data = MessageSerializer(message, context={'request': request}).data
            
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
            except Exception as e:
                logger.warning(f'Failed to send WebSocket message: {e}')
            
            return Response(message_data, status=status.HTTP_201_CREATED)
        except Exception as e:
            logger.error(f'Error uploading voice: {e}', exc_info=True)
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
