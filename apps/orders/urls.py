from django.urls import path
from .views import OrderListView, OrderDetailView, OrderStartView, OrderStopView, OrderCompleteView, OrderRejectView, OrderTrackView, OrderUpdateLocationView

app_name = 'orders'

urlpatterns = [
    path('', OrderListView.as_view(), name='list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='detail'),
    path('<int:pk>/start/', OrderStartView.as_view(), name='start'),
    path('<int:pk>/stop/', OrderStopView.as_view(), name='stop'),
    path('<int:pk>/complete/', OrderCompleteView.as_view(), name='complete'),
    path('<int:pk>/reject/', OrderRejectView.as_view(), name='reject'),
    path('<int:pk>/track/', OrderTrackView.as_view(), name='track'),
    path('<int:pk>/update-location/', OrderUpdateLocationView.as_view(), name='update-location'),
]

