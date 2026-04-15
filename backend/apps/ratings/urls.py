from django.urls import path
from .views import RatingCreateView, RatingListView, RatingDetailView, UserRatingStatsView
from .history_views import ReviewsHistoryView, ReviewsStatisticsView, ReviewsRecommendationsView

app_name = 'ratings'

urlpatterns = [
    path('', RatingListView.as_view(), name='list'),
    path('create/', RatingCreateView.as_view(), name='create'),
    path('<int:pk>/', RatingDetailView.as_view(), name='detail'),
    path('user/<int:user_id>/stats/', UserRatingStatsView.as_view(), name='user-stats'),
    path('history/', ReviewsHistoryView.as_view(), name='history'),
    path('statistics/', ReviewsStatisticsView.as_view(), name='statistics'),
    path('recommendations/', ReviewsRecommendationsView.as_view(), name='recommendations'),
]
