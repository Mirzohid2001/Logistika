from django.urls import path
from .views import (
    MyPaymentsView,
    OrderCompletionFeeListView,
    OrderCompletionFeePayView,
    OrderCompletionFeeSummaryView,
    OrderPaymentsView,
    PaymentCallbackView,
    PaymentCreateView,
    PaymentHistoryView,
    PaymentRefundView,
    PaymentStatusView,
    WalletView,
)

app_name = 'payments'

urlpatterns = [
    path('create/', PaymentCreateView.as_view(), name='create'),
    path('wallet/', WalletView.as_view(), name='wallet'),
    path('completion-fees/', OrderCompletionFeeListView.as_view(), name='completion-fees'),
    path('completion-fees/summary/', OrderCompletionFeeSummaryView.as_view(), name='completion-fee-summary'),
    path('completion-fees/<int:pk>/pay/', OrderCompletionFeePayView.as_view(), name='completion-fee-pay'),
    path('my/', MyPaymentsView.as_view(), name='my'),
    path('<int:pk>/status/', PaymentStatusView.as_view(), name='status'),
    path('<int:pk>/callback/', PaymentCallbackView.as_view(), name='callback'),
    path('<int:pk>/history/', PaymentHistoryView.as_view(), name='history'),
    path('<int:pk>/refund/', PaymentRefundView.as_view(), name='refund'),
    path('order/<int:order_id>/', OrderPaymentsView.as_view(), name='order-payments'),
]
