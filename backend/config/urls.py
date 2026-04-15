from django.contrib import admin
from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from django.contrib.staticfiles.urls import staticfiles_urlpatterns
from apps.users.sms_views import SendSMSCodeView, VerifySMSView
from apps.users.admin_views import DriverEarningsStatisticsView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView, SpectacularRedocView
from config.admin import admin_site

urlpatterns = [
    path('admin/', admin_site.urls),
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
    path('api/auth/', include('apps.users.urls')),
    path('api/auth/send-sms-code/', SendSMSCodeView.as_view(), name='send-sms-code'),
    path('api/auth/verify-sms/', VerifySMSView.as_view(), name='verify-sms'),
    path('api/users/', include('apps.users.urls')),
    path('api/users/vehicles/', include('apps.vehicles.urls')),
    path('api/locations/', include('apps.locations.urls')),
    path('api/advertisements/', include('apps.advertisements.urls')),
    path('api/bids/', include('apps.bids.urls')),
    path('api/orders/', include('apps.orders.urls')),
    path('api/news/', include('apps.news.urls')),
    path('api/content/', include('apps.content.urls')),
    path('api/payments/', include('apps.payments.urls')),
    path('api/chats/', include('apps.chats.urls')),
    path('api/ratings/', include('apps.ratings.urls')),
    path('api/dispatcher/', include('apps.dispatcher.urls')),
    path('api/updater/', include('apps.updater.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/admin/driver-earnings-statistics/', DriverEarningsStatisticsView.as_view(), name='driver-earnings-statistics'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)
    urlpatterns += staticfiles_urlpatterns()
