from django.urls import path
from .views import (
    RegisterView,
    LoginView,
    RefreshTokenView,
    MeView,
    UserEarningsView,
    UserUploadDocumentsView,
    UpdateFCMTokenView,
    DriverDocumentListCreateView,
    DriverDocumentDetailView,
    DriverDocumentMonitoringView,
)
from .password_views import ResetPasswordView
from .company_views import CompanyMembersView, CompanyBootstrapView, CompanyProfileView
from .payout_views import DriverPayoutRequestListCreateView
from .analytics_views import AdvancedAnalyticsView
from .telegram_views import TelegramAuthCallbackView, TelegramAuthCompleteView, TelegramAuthStartView

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('refresh/', RefreshTokenView.as_view(), name='refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('upload-documents/', UserUploadDocumentsView.as_view(), name='upload-documents'),
    path('earnings/', UserEarningsView.as_view(), name='earnings'),
    path('fcm-token/', UpdateFCMTokenView.as_view(), name='fcm-token'),
    path('driver-documents/', DriverDocumentListCreateView.as_view(), name='driver-documents'),
    path('driver-documents/<int:pk>/', DriverDocumentDetailView.as_view(), name='driver-document-detail'),
    path('driver-documents/monitoring/', DriverDocumentMonitoringView.as_view(), name='driver-documents-monitoring'),
    path('analytics/', AdvancedAnalyticsView.as_view(), name='analytics'),
    path('reset-password/', ResetPasswordView.as_view(), name='reset-password'),
    path('telegram/start/', TelegramAuthStartView.as_view(), name='telegram-start'),
    path('telegram/callback/', TelegramAuthCallbackView.as_view(), name='telegram-callback'),
    path('telegram/complete/', TelegramAuthCompleteView.as_view(), name='telegram-complete'),
    path('company/', CompanyProfileView.as_view(), name='company-profile'),
    path('company/members/', CompanyMembersView.as_view(), name='company-members'),
    path('company/bootstrap/', CompanyBootstrapView.as_view(), name='company-bootstrap'),
    path('payout-requests/', DriverPayoutRequestListCreateView.as_view(), name='payout-requests'),
]
