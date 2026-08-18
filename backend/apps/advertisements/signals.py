from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

from .models import Advertisement
from .saved_search_alerts import notify_saved_search_matches
from .tasks import schedule_driver_load_offers

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Advertisement)
def advertisement_saved_search_alerts(sender, instance: Advertisement, created: bool, **kwargs):
    if not created or instance.is_closed:
        return

    advertisement_id = instance.id

    def _after_commit():
        try:
            notify_saved_search_matches(Advertisement.objects.filter(pk=advertisement_id).first() or instance)
        except Exception:
            logger.exception(
                'Saved search alert failed',
                extra={'event': 'saved_search_alert_failed'},
            )
        try:
            schedule_driver_load_offers(advertisement_id)
        except Exception:
            logger.exception(
                'Driver load offer failed',
                extra={'event': 'driver_load_offer_failed', 'advertisement_id': advertisement_id},
            )

    transaction.on_commit(_after_commit)
