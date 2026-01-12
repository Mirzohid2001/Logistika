from django.urls import path
from .views import PaymentCreateView, PaymentStatusView, PaymentCallbackView, MyPaymentsView, OrderPaymentsView

app_name = 'payments'

urlpatterns = [
    path('create/', PaymentCreateView.as_view(), name='create'),
    path('my/', MyPaymentsView.as_view(), name='my'),
    path('<int:pk>/status/', PaymentStatusView.as_view(), name='status'),
    path('<int:pk>/callback/', PaymentCallbackView.as_view(), name='callback'),
    path('order/<int:order_id>/', OrderPaymentsView.as_view(), name='order-payments'),
]

