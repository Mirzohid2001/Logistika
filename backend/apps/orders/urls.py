from django.urls import path
from .views import (
    OrderListView,
    OrderDetailView,
    OrderStartView,
    OrderStopView,
    OrderCompleteView,
    OrderRejectView,
    OrderTrackView,
    OrderUpdateLocationView,
    OrderApproveByClientView,
    DriverStatisticsView,
    ClientStatisticsView,
    OrderVerifyByQRView,
    OrderVerifyAndApproveByQRView,
    OrderRoutePlanView,
    OrderProofOfDeliveryCreateView,
    OrderReturnQualityView,
    OrderTrackingShareLinkCreateView,
    PublicOrderTrackingShareView,
)

app_name = 'orders'

urlpatterns = [
    path('', OrderListView.as_view(), name='list'),
    path('<int:pk>/', OrderDetailView.as_view(), name='detail'),
    path('<int:pk>/start/', OrderStartView.as_view(), name='start'),
    path('<int:pk>/approve/', OrderApproveByClientView.as_view(), name='approve'),
    path('<int:pk>/stop/', OrderStopView.as_view(), name='stop'),
    path('<int:pk>/complete/', OrderCompleteView.as_view(), name='complete'),
    path('<int:pk>/reject/', OrderRejectView.as_view(), name='reject'),
    path('<int:pk>/track/', OrderTrackView.as_view(), name='track'),
    path('<int:pk>/update-location/', OrderUpdateLocationView.as_view(), name='update-location'),
    path('<int:pk>/route-plan/', OrderRoutePlanView.as_view(), name='route-plan'),
    path('<int:pk>/proof-of-delivery/', OrderProofOfDeliveryCreateView.as_view(), name='proof-of-delivery'),
    path('<int:pk>/return-quality/', OrderReturnQualityView.as_view(), name='return-quality'),
    path('<int:pk>/share-link/', OrderTrackingShareLinkCreateView.as_view(), name='share-link'),
    path('share/<uuid:token>/', PublicOrderTrackingShareView.as_view(), name='share-public'),
    path('statistics/driver/', DriverStatisticsView.as_view(), name='driver-statistics'),
    path('statistics/client/', ClientStatisticsView.as_view(), name='client-statistics'),
    path('verify-qr/', OrderVerifyByQRView.as_view(), name='verify-qr'),
    path('verify-qr-approve/', OrderVerifyAndApproveByQRView.as_view(), name='verify-qr-approve'),
]

