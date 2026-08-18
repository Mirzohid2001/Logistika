from django.urls import path
from .views import (
    AdvertisementListView, AdvertisementDetailView, MyAdvertisementsView, AdvertisementAcceptView,
    FavoriteAdvertisementListView, FavoriteAdvertisementCreateView, FavoriteAdvertisementDeleteView,
    SavedSearchListView, SavedSearchCreateView, SavedSearchDetailView, SavedSearchApplyView,
    PriceInsightView, BackhaulMatchesView, AdvertisementTripEstimateView, AdvertisementLoadFitView,
    AdvertisementReorderFromOrderView, RouteHealthView, DuplicateRiskView,
    DriverMatchesView, DriverAvailabilityView, DriverLaneListCreateView, DriverLaneDetailView,
)

app_name = 'advertisements'

urlpatterns = [
    path('price-insight/', PriceInsightView.as_view(), name='price-insight'),
    path('backhaul-matches/', BackhaulMatchesView.as_view(), name='backhaul-matches'),
    path('for-driver/', DriverMatchesView.as_view(), name='for-driver'),
    path('driver/availability/', DriverAvailabilityView.as_view(), name='driver-availability'),
    path('driver/lanes/', DriverLaneListCreateView.as_view(), name='driver-lanes'),
    path('driver/lanes/<int:pk>/', DriverLaneDetailView.as_view(), name='driver-lane-detail'),
    path('route-health/', RouteHealthView.as_view(), name='route-health'),
    path('duplicate-risk/', DuplicateRiskView.as_view(), name='duplicate-risk'),
    path('reorder-from-order/<int:order_id>/', AdvertisementReorderFromOrderView.as_view(), name='reorder-from-order'),
    path('', AdvertisementListView.as_view(), name='list'),
    path('my/', MyAdvertisementsView.as_view(), name='my'),
    path('<int:pk>/', AdvertisementDetailView.as_view(), name='detail'),
    path('<int:pk>/accept/', AdvertisementAcceptView.as_view(), name='accept'),
    path('<int:pk>/trip-estimate/', AdvertisementTripEstimateView.as_view(), name='trip-estimate'),
    path('<int:pk>/load-fit/', AdvertisementLoadFitView.as_view(), name='load-fit'),
    path('favorites/', FavoriteAdvertisementListView.as_view(), name='favorites'),
    path('<int:pk>/favorite/', FavoriteAdvertisementCreateView.as_view(), name='favorite-create'),
    path('favorites/<int:pk>/', FavoriteAdvertisementDeleteView.as_view(), name='favorite-delete'),
    path('saved-searches/', SavedSearchListView.as_view(), name='saved-searches'),
    path('saved-searches/create/', SavedSearchCreateView.as_view(), name='saved-search-create'),
    path('saved-searches/<int:pk>/', SavedSearchDetailView.as_view(), name='saved-search-detail'),
    path('saved-searches/<int:pk>/apply/', SavedSearchApplyView.as_view(), name='saved-search-apply'),
]

