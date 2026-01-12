from django.urls import path
from .views import PublicOfferView, DisclaimerView, GuideClientsView, GuideDriversView

app_name = 'content'

urlpatterns = [
    path('public-offer/', PublicOfferView.as_view(), name='public-offer'),
    path('disclaimer/', DisclaimerView.as_view(), name='disclaimer'),
    path('guide-clients/', GuideClientsView.as_view(), name='guide-clients'),
    path('guide-drivers/', GuideDriversView.as_view(), name='guide-drivers'),
]

