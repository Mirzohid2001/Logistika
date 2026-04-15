"""
ASGI config for config project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/4.2/howto/deployment/asgi/
"""

import os
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application
from django.contrib.staticfiles.handlers import ASGIStaticFilesHandler
from django.conf import settings

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

django_asgi_app = get_asgi_application()
if settings.DEBUG:
    django_asgi_app = ASGIStaticFilesHandler(django_asgi_app)

from apps.chats import routing as chats_routing
from apps.dispatcher import routing as dispatcher_routing
from apps.chats.middleware import JWTAuthMiddlewareStack

websocket_application = JWTAuthMiddlewareStack(
    URLRouter(
        chats_routing.websocket_urlpatterns + dispatcher_routing.websocket_urlpatterns
    )
)

if settings.DEBUG:
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": websocket_application,
    })
else:
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": AllowedHostsOriginValidator(websocket_application),
    })
