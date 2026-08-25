from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-*eh*rch14p(_v)446m*xji3)&2!%&d$q_#v$p*dwz6hjyktk^3')
DEBUG = config('DEBUG', default=True, cast=bool)

if not DEBUG and SECRET_KEY.startswith('django-insecure'):
    raise ValueError('Set a strong SECRET_KEY in production (DEBUG=False).')

# When True, clients can use payment_method="mock" to mark a payment completed immediately (no gateway callback).
# Default follows DEBUG so local/staging works without Click/Payme webhooks hitting localhost.
PAYMENTS_ALLOW_MOCK = config('PAYMENTS_ALLOW_MOCK', default=DEBUG, cast=bool)
# Buyurtma to'lovi shafyor va mijoz o'rtasida — platforma orqali emas.
ORDER_PLATFORM_PAYMENTS_ENABLED = config('ORDER_PLATFORM_PAYMENTS_ENABLED', default=False, cast=bool)
PLATFORM_COMMISSION_PERCENT = config('PLATFORM_COMMISSION_PERCENT', default=10, cast=int)
CANCELLATION_FEE_CLIENT_BEFORE_START_PERCENT = config(
    'CANCELLATION_FEE_CLIENT_BEFORE_START_PERCENT', default=0, cast=int,
)
CANCELLATION_FEE_CLIENT_AFTER_START_PERCENT = config(
    'CANCELLATION_FEE_CLIENT_AFTER_START_PERCENT', default=20, cast=int,
)
CANCELLATION_FEE_DRIVER_AFTER_START_PERCENT = config(
    'CANCELLATION_FEE_DRIVER_AFTER_START_PERCENT', default=10, cast=int,
)
SUBSCRIPTIONS_ENFORCED = config('SUBSCRIPTIONS_ENFORCED', default=False, cast=bool)
SUBSCRIPTION_FREE_TRIAL_USES = config('SUBSCRIPTION_FREE_TRIAL_USES', default=3, cast=int)
SUBSCRIPTION_TRIAL_ONE_ACCOUNT_PER_DEVICE = config(
    'SUBSCRIPTION_TRIAL_ONE_ACCOUNT_PER_DEVICE', default=True, cast=bool
)
SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER = config(
    'SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER', default=True, cast=bool
)
SMS_VERIFICATION_REQUIRED = config('SMS_VERIFICATION_REQUIRED', default=False, cast=bool)

# Telegram is the only public registration provider. Existing password accounts
# can still sign in while they are progressively linked to Telegram by the
# verified phone_number claim returned by Telegram OIDC.
TELEGRAM_ONLY_REGISTRATION = config('TELEGRAM_ONLY_REGISTRATION', default=True, cast=bool)
TELEGRAM_AUTH_CLIENT_ID = config('TELEGRAM_AUTH_CLIENT_ID', default='')
TELEGRAM_AUTH_CLIENT_SECRET = config('TELEGRAM_AUTH_CLIENT_SECRET', default='')
TELEGRAM_AUTH_REDIRECT_URI = config('TELEGRAM_AUTH_REDIRECT_URI', default='')
TELEGRAM_AUTH_MOBILE_REDIRECT_URI = config(
    'TELEGRAM_AUTH_MOBILE_REDIRECT_URI', default='logistika://auth/telegram'
)
TELEGRAM_AUTH_ISSUER = 'https://oauth.telegram.org'
TELEGRAM_AUTH_AUTHORIZE_URL = 'https://oauth.telegram.org/auth'
TELEGRAM_AUTH_TOKEN_URL = 'https://oauth.telegram.org/token'
TELEGRAM_AUTH_JWKS_URL = 'https://oauth.telegram.org/.well-known/jwks.json'
TELEGRAM_AUTH_STATE_TTL_SECONDS = config(
    'TELEGRAM_AUTH_STATE_TTL_SECONDS', default=600, cast=int
)
TELEGRAM_AUTH_TICKET_TTL_SECONDS = config(
    'TELEGRAM_AUTH_TICKET_TTL_SECONDS', default=120, cast=int
)

SENTRY_DSN = config('SENTRY_DSN', default='')
SENTRY_ENVIRONMENT = config('SENTRY_ENVIRONMENT', default='development' if DEBUG else 'production')
SENTRY_TRACES_SAMPLE_RATE = config('SENTRY_TRACES_SAMPLE_RATE', default=0.1, cast=float)
STRUCTURED_LOGS = config('STRUCTURED_LOGS', default=not DEBUG, cast=bool)
EXTERNAL_HTTP_CONNECT_TIMEOUT = config('EXTERNAL_HTTP_CONNECT_TIMEOUT', default=5, cast=float)
EXTERNAL_HTTP_READ_TIMEOUT = config('EXTERNAL_HTTP_READ_TIMEOUT', default=15, cast=float)
TRUST_X_FORWARDED_FOR = config('TRUST_X_FORWARDED_FOR', default=False, cast=bool)

if SENTRY_DSN:
    import sentry_sdk
    from sentry_sdk.integrations.celery import CeleryIntegration
    from sentry_sdk.integrations.django import DjangoIntegration
    from sentry_sdk.integrations.redis import RedisIntegration

    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENVIRONMENT,
        integrations=[DjangoIntegration(), CeleryIntegration(), RedisIntegration()],
        traces_sample_rate=SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
    )

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,0.0.0.0', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

REDIS_URL = config('REDIS_URL', default='redis://127.0.0.1:6379/1')

import os

# Cache configuration
# Use Redis for production, LocMemCache for development
if DEBUG:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
        }
    }
else:
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
            'KEY_PREFIX': 'logistika',
            'TIMEOUT': 300,
        }
    }

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'channels',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'drf_spectacular',
    'apps.users',
    'apps.vehicles',
    'apps.advertisements',
    'apps.orders',
    'apps.bids',
    'apps.locations',
    'apps.news',
    'apps.content',
    'apps.payments.apps.PaymentsConfig',
    'apps.common',
    'apps.chats',
    'apps.ratings',
    'apps.dispatcher',
    'apps.updater',
    'apps.notifications',
    'apps.subscriptions',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.gzip.GZipMiddleware',  # Response compression
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'apps.common.middleware.RequestValidationMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'apps.subscriptions.middleware.SubscriptionEnforcementMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'config' / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels_redis.core.RedisChannelLayer',
        'CONFIG': {
            'hosts': [REDIS_URL],
        },
    },
}

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.postgresql',
        'NAME': os.environ.get('POSTGRES_DB', 'postgres'),
        'USER': os.environ.get('POSTGRES_USER', 'postgres'),
        'PASSWORD': os.environ.get('POSTGRES_PASSWORD', ''),
        'HOST': os.environ.get('POSTGRES_HOST', 'localhost'),
        'PORT': os.environ.get('POSTGRES_PORT', 5432),
        'CONN_MAX_AGE': config('DB_CONN_MAX_AGE', default=60 if not DEBUG else 0, cast=int),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'ru'
TIME_ZONE = 'Asia/Tashkent'
USE_I18N = True
USE_TZ = True

LANGUAGES = [
    ('ru', 'Russian'),
    ('en', 'English'),
    ('uz', 'Uzbek'),
]

STATIC_URL = '/static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

MEDIA_URL = '/media/'
MEDIA_ROOT = BASE_DIR / 'media'

AWS_ACCESS_KEY_ID = config('AWS_ACCESS_KEY_ID', default='')
AWS_SECRET_ACCESS_KEY = config('AWS_SECRET_ACCESS_KEY', default='')
AWS_STORAGE_BUCKET_NAME = config('AWS_STORAGE_BUCKET_NAME', default='')
AWS_S3_REGION_NAME = config('AWS_S3_REGION_NAME', default='us-east-1')
AWS_S3_CUSTOM_DOMAIN = config('AWS_S3_CUSTOM_DOMAIN', default='')
AWS_S3_OBJECT_PARAMETERS = {'CacheControl': 'private, max-age=300'}
AWS_QUERYSTRING_EXPIRE = config('AWS_QUERYSTRING_EXPIRE', default=300, cast=int)
# Serve uploaded files from local disk when DEBUG=False (e.g. docker-compose without S3).
SERVE_LOCAL_MEDIA = config('SERVE_LOCAL_MEDIA', default=DEBUG, cast=bool)

_staticfiles_backend = (
    'whitenoise.storage.CompressedManifestStaticFilesStorage'
    if not DEBUG
    else 'django.contrib.staticfiles.storage.StaticFilesStorage'
)

if AWS_STORAGE_BUCKET_NAME:
    STORAGES = {
        'default': {
            'BACKEND': 'storages.backends.s3.S3Storage',
            'OPTIONS': {
                'bucket_name': AWS_STORAGE_BUCKET_NAME,
                'region_name': AWS_S3_REGION_NAME,
                'custom_domain': AWS_S3_CUSTOM_DOMAIN or None,
                'default_acl': None,
                'querystring_auth': True,
                'querystring_expire': AWS_QUERYSTRING_EXPIRE,
                'file_overwrite': False,
            },
        },
        'staticfiles': {
            'BACKEND': _staticfiles_backend,
        },
    }
    if AWS_S3_CUSTOM_DOMAIN:
        MEDIA_URL = f'https://{AWS_S3_CUSTOM_DOMAIN}/'
    else:
        MEDIA_URL = f'https://{AWS_STORAGE_BUCKET_NAME}.s3.{AWS_S3_REGION_NAME}.amazonaws.com/'
else:
    STORAGES = {
        'default': {
            'BACKEND': 'django.core.files.storage.FileSystemStorage',
            'OPTIONS': {
                'location': MEDIA_ROOT,
                'base_url': MEDIA_URL,
            },
        },
        'staticfiles': {
            'BACKEND': _staticfiles_backend,
        },
    }

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

AUTH_USER_MODEL = 'users.User'

AUTHENTICATION_BACKENDS = [
    'django.contrib.auth.backends.ModelBackend',
]

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
        'apps.subscriptions.permissions.HasActiveSubscription',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'EXCEPTION_HANDLER': 'apps.common.error_handler.custom_exception_handler',
    # Rate limiting (throttling)
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '1000/hour' if DEBUG else '100/hour',  # Development: relaxed limits
        'user': '10000/hour' if DEBUG else '1000/hour',  # Development: relaxed limits
        'login': '30/minute' if DEBUG else '5/minute',
        'register': '100/hour' if DEBUG else '3/hour',
        'sms': '30/hour' if DEBUG else '5/hour',
        'telegram_auth': '60/hour' if DEBUG else '10/hour',
    },
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(hours=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'ALGORITHM': 'HS256',
    'SIGNING_KEY': SECRET_KEY,
    'AUTH_HEADER_TYPES': ('Bearer',),
}

CORS_ALLOWED_ORIGINS = config(
    'CORS_ALLOWED_ORIGINS',
    default='http://localhost:3000,http://127.0.0.1:3000',
    cast=lambda v: [s.strip() for s in v.split(',') if s.strip()]
)

# Development uchun barcha origin'lardan ruxsat berish
if DEBUG:
    CORS_ALLOW_ALL_ORIGINS = True
else:
    CORS_ALLOW_ALL_ORIGINS = False

CORS_ALLOW_CREDENTIALS = True

CLICK_MERCHANT_ID = config('CLICK_MERCHANT_ID', default='')
CLICK_SERVICE_ID = config('CLICK_SERVICE_ID', default='')
CLICK_SECRET_KEY = config('CLICK_SECRET_KEY', default='')
CLICK_API_URL = config('CLICK_API_URL', default='https://api.click.uz/v2/merchant/invoice/create')
CLICK_ALLOWED_IPS = config('CLICK_ALLOWED_IPS', default='', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

PAYME_MERCHANT_ID = config('PAYME_MERCHANT_ID', default='')
PAYME_KEY = config('PAYME_KEY', default='')
PAYME_SECRET_KEY = config('PAYME_SECRET_KEY', default='')
PAYME_API_URL = config('PAYME_API_URL', default='https://checkout.paycom.uz/api')
PAYME_ALLOWED_IPS = config('PAYME_ALLOWED_IPS', default='', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

UZUM_MERCHANT_ID = config('UZUM_MERCHANT_ID', default='')
UZUM_SECRET_KEY = config('UZUM_SECRET_KEY', default='')
UZUM_API_URL = config('UZUM_API_URL', default='https://api.uzum.uz/v1/payment')
UZUM_ALLOWED_IPS = config('UZUM_ALLOWED_IPS', default='', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

ESKIZ_EMAIL = config('ESKIZ_EMAIL', default='')
ESKIZ_PASSWORD = config('ESKIZ_PASSWORD', default='')
ESKIZ_API_URL = config('ESKIZ_API_URL', default='https://notify.eskiz.uz/api')
SMS_CODE_EXPIRATION_MINUTES = config('SMS_CODE_EXPIRATION_MINUTES', default=5, cast=int)
SMS_CODE_LENGTH = config('SMS_CODE_LENGTH', default=6, cast=int)

EMAIL_BACKEND = config('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
EMAIL_HOST = config('EMAIL_HOST', default='')
EMAIL_PORT = config('EMAIL_PORT', default=587, cast=int)
EMAIL_USE_TLS = config('EMAIL_USE_TLS', default=True, cast=bool)
EMAIL_HOST_USER = config('EMAIL_HOST_USER', default='')
EMAIL_HOST_PASSWORD = config('EMAIL_HOST_PASSWORD', default='')

SPECTACULAR_SETTINGS = {
    'TITLE': 'Logistika API',
    'DESCRIPTION': 'Yuk tashish agregatori API dokumentatsiyasi',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

if not DEBUG:
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
    SECURE_SSL_REDIRECT = config('SECURE_SSL_REDIRECT', default=True, cast=bool)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = config('SECURE_HSTS_SECONDS', default=31536000, cast=int)
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SECURE_REFERRER_POLICY = 'same-origin'

CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
# Yangi e'lon bo'yicha haydovchi offerlari: Celery worker bilan async.
MATCHING_OFFERS_ASYNC = config('MATCHING_OFFERS_ASYNC', default=True, cast=bool)

# Django testlari Redis worker kutmasin — offerlar sync bajarilsin.
import sys
if 'test' in sys.argv:
    MATCHING_OFFERS_ASYNC = False
    CELERY_TASK_ALWAYS_EAGER = True
GOOGLE_MAPS_API_KEY = config('GOOGLE_MAPS_API_KEY', default='')
YANDEX_ROUTING_API_KEY = config('YANDEX_ROUTING_API_KEY', default='')
ROUTING_PROVIDER_PRIORITY = config('ROUTING_PROVIDER_PRIORITY', default='google,yandex,haversine')
ORDER_LOCATION_TRACK_RETENTION_DAYS = config('ORDER_LOCATION_TRACK_RETENTION_DAYS', default=90, cast=int)

FCM_SERVER_KEY = config('FCM_SERVER_KEY', default='')
PUSH_MAX_RETRY_ATTEMPTS = config('PUSH_MAX_RETRY_ATTEMPTS', default=5, cast=int)
PUSH_RETRY_BACKOFF_SECONDS = config('PUSH_RETRY_BACKOFF_SECONDS', default=60, cast=int)

CELERY_BEAT_SCHEDULE = {
    'update-active-order-locations': {
        'task': 'apps.orders.tasks.update_active_order_locations',
        'schedule': 600.0,
    },
    'check-stopped-drivers': {
        'task': 'apps.orders.tasks.check_stopped_drivers',
        'schedule': 300.0,
    },
    'generate-daily-operations-report': {
        'task': 'apps.orders.tasks.generate_daily_operations_report',
        'schedule': 86400.0,
    },
    'generate-weekly-operations-report': {
        'task': 'apps.orders.tasks.generate_weekly_operations_report',
        'schedule': 604800.0,
    },
    'purge-old-location-tracks': {
        'task': 'apps.orders.tasks.purge_old_location_tracks',
        'schedule': 86400.0,
    },
    'retry-failed-push-notifications': {
        'task': 'apps.notifications.tasks.retry_failed_push_notifications',
        'schedule': 120.0,
    },
    'check-driver-document-expiry': {
        'task': 'apps.users.tasks.check_driver_document_expiry',
        'schedule': 86400.0,
    },
}

# Logging configuration
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {process:d} {thread:d} {message}',
            'style': '{',
        },
        'simple': {
            'format': '{levelname} {message}',
            'style': '{',
        },
        'json': {
            '()': 'apps.common.structured_logging.JsonFormatter',
        },
    },
    'filters': {
        'require_debug_true': {
            '()': 'django.utils.log.RequireDebugTrue',
        },
    },
    'handlers': {
        'console': {
            'level': 'INFO',
            'class': 'logging.StreamHandler',
            'formatter': 'json' if STRUCTURED_LOGS else 'verbose',
        },
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'error.log',
            'formatter': 'json' if STRUCTURED_LOGS else 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'django': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps': {
            'handlers': ['console', 'file'],
            'level': 'INFO',
            'propagate': False,
        },
        'apps.common.error_handler': {
            'handlers': ['console', 'file'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}

# Create logs directory if it doesn't exist
import os
logs_dir = BASE_DIR / 'logs'
if not os.path.exists(logs_dir):
    os.makedirs(logs_dir)

try:
    from .settings_dev import *
except ImportError:
    pass
