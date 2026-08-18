import json
import logging
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from apps.subscriptions.services import (
    subscriptions_enforced,
    user_has_marketplace_access,
    user_requires_subscription,
)
from apps.users.permissions import can_access_chat

from .models import Chat, Message
from .serializers import MessageSerializer

User = get_user_model()
logger = logging.getLogger(__name__)


class ChatConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        self.chat_id = self.scope['url_route']['kwargs']['chat_id']
        self.room_group_name = f'chat_{self.chat_id}'
        self.user = self.scope['user']

        if not self.user.is_authenticated:
            await self.close()
            return

        if not await self.can_join_chat():
            await self.close()
            return

        await self.channel_layer.group_add(
            self.room_group_name,
            self.channel_name
        )

        await self.accept()

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_online',
                'user_id': self.user.id,
            }
        )

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(
            self.room_group_name,
            self.channel_name
        )

        await self.channel_layer.group_send(
            self.room_group_name,
            {
                'type': 'user_offline',
                'user_id': self.user.id,
            }
        )

    async def receive(self, text_data):
        try:
            data = json.loads(text_data)
            message_type = data.get('type')

            if message_type == 'typing':
                await self.channel_layer.group_send(
                    self.room_group_name,
                    {
                        'type': 'typing_indicator',
                        'user_id': self.user.id,
                        'user_name': f"{self.user.first_name} {self.user.last_name}",
                        'is_typing': data.get('is_typing', False),
                    }
                )
            elif message_type == 'read_receipt':
                message_id = data.get('message_id')
                if message_id:
                    await self.mark_message_as_read(message_id)
            elif message_type == 'ping':
                await self.send(text_data=json.dumps({
                    'type': 'pong',
                }))
        except json.JSONDecodeError:
            logger.warning(
                'Invalid WebSocket payload',
                extra={'event': 'chat_ws_invalid_json'},
            )

    async def chat_message(self, event):
        message_data = event['message']
        await self.send(text_data=json.dumps({
            'type': 'new_message',
            'message': message_data,
        }))

    async def typing_indicator(self, event):
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'typing',
                'user_id': event['user_id'],
                'user_name': event['user_name'],
                'is_typing': event['is_typing'],
            }))

    async def user_online(self, event):
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user_status',
                'user_id': event['user_id'],
                'status': 'online',
            }))

    async def user_offline(self, event):
        if event['user_id'] != self.user.id:
            await self.send(text_data=json.dumps({
                'type': 'user_status',
                'user_id': event['user_id'],
                'status': 'offline',
            }))

    @database_sync_to_async
    def can_join_chat(self) -> bool:
        try:
            chat = Chat.objects.get(pk=self.chat_id)
        except Chat.DoesNotExist:
            return False
        if not can_access_chat(self.user, chat):
            return False
        if subscriptions_enforced() and user_requires_subscription(self.user):
            if not user_has_marketplace_access(self.user):
                return False
        return True

    @database_sync_to_async
    def mark_message_as_read(self, message_id):
        try:
            message = Message.objects.get(pk=message_id, chat_id=self.chat_id)
            if message.sender != self.user:
                message.is_read = True
                message.save()
        except Message.DoesNotExist:
            logger.info(
                'Read receipt for missing message',
                extra={'event': 'chat_read_missing_message'},
            )
