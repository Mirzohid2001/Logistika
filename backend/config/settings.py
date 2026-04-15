from pathlib import Path
from decouple import config
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent

SECRET_KEY = config('SECRET_KEY', default='django-insecure-*eh*rch14p(_v)446m*xji3)&2!%&d$q_#v$p*dwz6hjyktk^3')
DEBUG = config('DEBUG', default=True, cast=bool)

ALLOWED_HOSTS = config('ALLOWED_HOSTS', default='localhost,127.0.0.1,0.0.0.0,192.168.1.45', cast=lambda v: [s.strip() for s in v.split(',') if s.strip()])

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
            'LOCATION': config('REDIS_URL', default='redis://127.0.0.1:6379/1'),
            'OPTIONS': {
                'CLIENT_CLASS': 'django_redis.client.DefaultClient',
            },
            'KEY_PREFIX': 'logistika',
            'TIMEOUT': 300,  # 5 minutes default timeout
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
    'apps.payments',
    'apps.common',
    'apps.chats',
    'apps.ratings',
    'apps.dispatcher',
    'apps.updater',
    'apps.notifications',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.gzip.GZipMiddleware',  # Response compression
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'apps.common.middleware.RequestValidationMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
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
            "hosts": [('127.0.0.1', 6379)],
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

MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

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
        'register': '20/hour' if DEBUG else '3/hour',
        'sms': '30/hour' if DEBUG else '5/hour',
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
    'TITLE': 'MyGruz API',
    'DESCRIPTION': 'Yuk tashish agregatori API dokumentatsiyasi',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    'COMPONENT_SPLIT_REQUEST': True,
}

CELERY_BROKER_URL = config('CELERY_BROKER_URL', default='redis://localhost:6379/0')
CELERY_RESULT_BACKEND = config('CELERY_RESULT_BACKEND', default='redis://localhost:6379/0')
CELERY_ACCEPT_CONTENT = ['json']
CELERY_TASK_SERIALIZER = 'json'
CELERY_RESULT_SERIALIZER = 'json'
CELERY_TIMEZONE = TIME_ZONE
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
            'formatter': 'verbose',
        },
        'file': {
            'level': 'ERROR',
            'class': 'logging.FileHandler',
            'filename': BASE_DIR / 'logs' / 'error.log',
            'formatter': 'verbose',
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

