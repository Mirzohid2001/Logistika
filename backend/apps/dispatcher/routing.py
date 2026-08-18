from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
    re_path(r'ws/dispatcher/tracking/$', consumers.DispatcherTrackingConsumer.as_asgi()),
    re_path(r'ws/orders/(?P<order_id>\d+)/tracking/$', consumers.OrderTrackingConsumer.as_asgi()),
]
