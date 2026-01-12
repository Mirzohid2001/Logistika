from django.urls import path
from .views import RegisterView, LoginView, RefreshTokenView, MeView, UserVehiclesView, UserEarningsView, UserUploadDocumentsView

app_name = 'users'

urlpatterns = [
    path('register/', RegisterView.as_view(), name='register'),
    path('login/', LoginView.as_view(), name='login'),
    path('refresh/', RefreshTokenView.as_view(), name='refresh'),
    path('me/', MeView.as_view(), name='me'),
    path('upload-documents/', UserUploadDocumentsView.as_view(), name='upload-documents'),
    path('vehicles/', UserVehiclesView.as_view(), name='vehicles'),
    path('earnings/', UserEarningsView.as_view(), name='earnings'),
]

