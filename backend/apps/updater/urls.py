from django.urls import path
from .views import (
    UpdaterDashboardView,
    UpdaterPendingUpdatesView,
    UpdaterUpdateStatusView,
    UpdaterUpdateLocationView,
    UpdaterUpdatePaymentView,
    UpdaterBulkUpdateView,
    UpdaterTrackingView,
    UpdaterActiveTrackingView,
    UpdaterLogsView,
    UpdaterStatisticsView,
    UpdaterOrderHistoryView,
    UpdaterPaymentMonitoringView,
    UpdaterProblematicOrdersView,
    UpdaterLocationHistoryView,
    UpdaterAnalyticsView,
    UpdaterBulkOperationsView,
    UpdaterExportView,
)

app_name = 'updater'

urlpatterns = [
    path('dashboard/', UpdaterDashboardView.as_view(), name='dashboard'),
    path('pending-updates/', UpdaterPendingUpdatesView.as_view(), name='pending-updates'),
    path('orders/<int:pk>/update-status/', UpdaterUpdateStatusView.as_view(), name='update-status'),
    path('orders/<int:pk>/update-location/', UpdaterUpdateLocationView.as_view(), name='update-location'),
    path('orders/<int:pk>/update-payment/', UpdaterUpdatePaymentView.as_view(), name='update-payment'),
    path('orders/<int:pk>/bulk-update/', UpdaterBulkUpdateView.as_view(), name='bulk-update'),
    path('orders/<int:pk>/tracking/', UpdaterTrackingView.as_view(), name='tracking'),
    path('active-tracking/', UpdaterActiveTrackingView.as_view(), name='active-tracking'),
    path('order-history/', UpdaterOrderHistoryView.as_view(), name='order-history'),
    path('payment-monitoring/', UpdaterPaymentMonitoringView.as_view(), name='payment-monitoring'),
    path('problematic-orders/', UpdaterProblematicOrdersView.as_view(), name='problematic-orders'),
    path('location-history/', UpdaterLocationHistoryView.as_view(), name='location-history'),
    path('logs/', UpdaterLogsView.as_view(), name='logs'),
    path('statistics/', UpdaterStatisticsView.as_view(), name='statistics'),
    path('analytics/', UpdaterAnalyticsView.as_view(), name='analytics'),
    path('bulk-operations/', UpdaterBulkOperationsView.as_view(), name='bulk-operations'),
    path('export/', UpdaterExportView.as_view(), name='export'),
]
