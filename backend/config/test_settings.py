from .settings import *  # noqa: F403


DATABASES = {  # noqa: F405
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    },
}

CACHES = {
    'default': {
        'BACKEND': 'django.core.cache.backends.locmem.LocMemCache',
    },
}

CHANNEL_LAYERS = {
    'default': {
        'BACKEND': 'channels.layers.InMemoryChannelLayer',
    },
}

PASSWORD_HASHERS = ['django.contrib.auth.hashers.MD5PasswordHasher']
CELERY_TASK_ALWAYS_EAGER = True
PREPAID_BALANCES_ENFORCED = False

# A few historical migrations contain PostgreSQL-specific SQL. Unit tests use
# Django's model-state table creation for local apps and keep framework
# migrations (auth, sessions, token blacklist) enabled.
MIGRATION_MODULES = {
    app: None
    for app in [
        'users',
        'vehicles',
        'advertisements',
        'orders',
        'bids',
        'locations',
        'news',
        'content',
        'payments',
        'common',
        'chats',
        'ratings',
        'dispatcher',
        'updater',
        'notifications',
        'subscriptions',
    ]
}


def _seed_test_reference_data(sender, app_config=None, **kwargs):
    if not app_config:
        return
    if app_config.label == 'orders':
        from apps.orders.models import OrderStatus

        names = {
            'new': ('Новый', 'New', 'Yangi'),
            'pending': ('Ожидает', 'Pending', 'Kutilmoqda'),
            'approved_by_client': ('Одобрен клиентом', 'Approved by client', 'Mijoz tasdiqladi'),
            'in_progress': ('В процессе', 'In progress', 'Jarayonda'),
            'in_transit': ('В пути', 'In transit', "Yo'lda"),
            'stopped': ('Остановлен', 'Stopped', "To'xtatilgan"),
            'completed': ('Завершён', 'Completed', 'Yakunlangan'),
            'cancelled': ('Отменён', 'Cancelled', 'Bekor qilingan'),
            'rejected': ('Отклонён', 'Rejected', 'Rad etilgan'),
        }
        for code, (name_ru, name_en, name_uz) in names.items():
            OrderStatus.objects.get_or_create(
                code=code,
                defaults={'name_ru': name_ru, 'name_en': name_en, 'name_uz': name_uz},
            )
    elif app_config.label == 'subscriptions':
        from apps.subscriptions.models import SubscriptionPlan

        for code, audience, price in (
            ('client_monthly', 'client', 99000),
            ('driver_monthly', 'driver', 149000),
        ):
            SubscriptionPlan.objects.get_or_create(
                code=code,
                defaults={
                    'audience': audience,
                    'name_ru': code,
                    'name_uz': code,
                    'name_en': code,
                    'price': price,
                    'duration_days': 30,
                },
            )


from django.db.models.signals import post_migrate  # noqa: E402

post_migrate.connect(_seed_test_reference_data, dispatch_uid='seed_test_reference_data')
