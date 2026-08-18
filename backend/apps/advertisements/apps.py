from django.apps import AppConfig


class AdvertisementsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'apps.advertisements'

    def ready(self):
        import apps.advertisements.signals  # noqa: F401
