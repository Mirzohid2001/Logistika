from django.urls import path
from .views import VehicleListView, VehicleDetailView

app_name = 'vehicles'

urlpatterns = [
    path('', VehicleListView.as_view(), name='list'),
    path('<int:pk>/', VehicleDetailView.as_view(), name='detail'),
]

