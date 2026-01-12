from django.urls import path
from .views import AdvertisementListView, AdvertisementDetailView, MyAdvertisementsView, AdvertisementAcceptView

app_name = 'advertisements'

urlpatterns = [
    path('', AdvertisementListView.as_view(), name='list'),
    path('my/', MyAdvertisementsView.as_view(), name='my'),
    path('<int:pk>/', AdvertisementDetailView.as_view(), name='detail'),
    path('<int:pk>/accept/', AdvertisementAcceptView.as_view(), name='accept'),
]

