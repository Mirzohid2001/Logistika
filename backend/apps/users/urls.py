from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    RefreshTokenView,
    MeView,
    UserVehiclesView,
    UserEarningsView,
    UserUploadDocumentsView,
    UpdateFCMTokenView,
    DriverDocumentListCreateView,
    DriverDocumentDetailView,
    DriverDocumentMonitoringView,
)
from .analytics_views import AdvancedAnalyticsView

app_name = 'users'

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('refresh/', RefreshTokenView.as_view(), name='refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('upload-documents/', UserUploadDocumentsView.as_view(), name='upload-documents'),
    path('vehicles/', UserVehiclesView.as_view(), name='vehicles'),
    path('earnings/', UserEarningsView.as_view(), name='earnings'),
    path('fcm-token/', UpdateFCMTokenView.as_view(), name='fcm-token'),
    path('driver-documents/', DriverDocumentListCreateView.as_view(), name='driver-documents'),
    path('driver-documents/<int:pk>/', DriverDocumentDetailView.as_view(), name='driver-document-detail'),
    path('driver-documents/monitoring/', DriverDocumentMonitoringView.as_view(), name='driver-documents-monitoring'),
    path('analytics/', AdvancedAnalyticsView.as_view(), name='analytics'),
]

