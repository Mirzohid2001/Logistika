from django.urls import path
from .views import CountryListView, CityListView, NearestCityView

app_name = 'locations'

urlpatterns = [
    path('countries/', CountryListView.as_view(), name='countries'),
    path('cities/', CityListView.as_view(), name='cities'),
    path('nearest-city/', NearestCityView.as_view(), name='nearest-city'),
]

