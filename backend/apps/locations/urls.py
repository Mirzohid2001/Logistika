from django.urls import path
from .views import CountryListView, CityListView

app_name = 'locations'

urlpatterns = [
    path('countries/', CountryListView.as_view(), name='countries'),
    path('cities/', CityListView.as_view(), name='cities'),
]

