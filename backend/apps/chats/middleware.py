from channels.middleware import BaseMiddleware
from channels.auth import AuthMiddlewareStack
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from urllib.parse import parse_qs

from .ws_auth import consume_ws_ticket

User = get_user_model()


class JWTAuthMiddleware(BaseMiddleware):
    def __init__(self, inner):
        super().__init__(inner)

    async def __call__(self, scope, receive, send):
        query_string = scope.get('query_string', b'').decode()
        query_params = parse_qs(query_string)
        ticket = query_params.get('ticket', [None])[0]

        if not ticket:
            scope['user'] = AnonymousUser()
        else:
            user_id = await self.resolve_user_id(ticket)
            user = await self.get_user(user_id) if user_id else None
            scope['user'] = user if user else AnonymousUser()

        return await super().__call__(scope, receive, send)

    @database_sync_to_async
    def resolve_user_id(self, ticket):
        return consume_ws_ticket(ticket)

    @database_sync_to_async
    def get_user(self, user_id):
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None


def JWTAuthMiddlewareStack(inner):
    return JWTAuthMiddleware(AuthMiddlewareStack(inner))
