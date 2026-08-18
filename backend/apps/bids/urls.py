from django.urls import path
from .views import BidCreateView, BidAcceptPriceView, BidRejectView, BidCounterOfferView, BidAgreeCounterView, MyBidsView, AdvertisementBidsView

app_name = 'bids'

urlpatterns = [
    path('', BidCreateView.as_view(), name='create'),
    path('my/', MyBidsView.as_view(), name='my'),
    path('<int:pk>/accept-price/', BidAcceptPriceView.as_view(), name='accept-price'),
    path('<int:pk>/reject/', BidRejectView.as_view(), name='reject'),
    path('<int:pk>/counter-offer/', BidCounterOfferView.as_view(), name='counter-offer'),
    path('<int:pk>/agree-counter/', BidAgreeCounterView.as_view(), name='agree-counter'),
    path('advertisement/<int:advertisement_id>/', AdvertisementBidsView.as_view(), name='advertisement-bids'),
]

