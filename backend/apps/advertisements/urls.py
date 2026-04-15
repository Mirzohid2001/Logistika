from django.urls import path
from .views import (
    AdvertisementListView, AdvertisementDetailView, MyAdvertisementsView, AdvertisementAcceptView,
    FavoriteAdvertisementListView, FavoriteAdvertisementCreateView, FavoriteAdvertisementDeleteView,
    SavedSearchListView, SavedSearchCreateView, SavedSearchDetailView, SavedSearchApplyView
)

app_name = 'advertisements'

urlpatterns = [
    path('', AdvertisementListView.as_view(), name='list'),
    path('my/', MyAdvertisementsView.as_view(), name='my'),
    path('<int:pk>/', AdvertisementDetailView.as_view(), name='detail'),
    path('<int:pk>/accept/', AdvertisementAcceptView.as_view(), name='accept'),
    path('favorites/', FavoriteAdvertisementListView.as_view(), name='favorites'),
    path('<int:pk>/favorite/', FavoriteAdvertisementCreateView.as_view(), name='favorite-create'),
    path('favorites/<int:pk>/', FavoriteAdvertisementDeleteView.as_view(), name='favorite-delete'),
    path('saved-searches/', SavedSearchListView.as_view(), name='saved-searches'),
    path('saved-searches/create/', SavedSearchCreateView.as_view(), name='saved-search-create'),
    path('saved-searches/<int:pk>/', SavedSearchDetailView.as_view(), name='saved-search-detail'),
    path('saved-searches/<int:pk>/apply/', SavedSearchApplyView.as_view(), name='saved-search-apply'),
]

