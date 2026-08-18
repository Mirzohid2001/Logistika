from django.urls import path

from .views import MySubscriptionView, SubscribeView, SubscriptionPlanListView

app_name = 'subscriptions'

urlpatterns = [
    path('plans/', SubscriptionPlanListView.as_view(), name='plans'),
    path('me/', MySubscriptionView.as_view(), name='me'),
    path('subscribe/', SubscribeView.as_view(), name='subscribe'),
]
