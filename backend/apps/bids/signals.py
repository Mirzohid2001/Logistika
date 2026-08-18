from django.db.models.signals import post_save
from django.dispatch import receiver
import logging

from apps.notifications.services import create_notification

from .models import Bid

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Bid)
def create_bid_notification(sender, instance: Bid, created: bool, **kwargs):
    """
    Ensure client gets notification whenever a new bid is created.
    Signal-based approach keeps this reliable regardless of creation entrypoint.
    """
    if not created:
        return

    try:
        amount = instance.get_current_amount() or ""
        create_notification(
            user=instance.client,
            notification_type="bid_received",
            title="Yangi taklif",
            message=(
                f"Sizning e'loningizga yangi taklif yuborildi. "
                f"Haydovchi: {instance.driver.first_name} {instance.driver.last_name}. "
                f"Taklif: {amount} so'm."
            ),
            advertisement=instance.advertisement,
            send_push=True,
        )
    except Exception:
        logger.exception(
            'Bid notification failed',
            extra={'event': 'bid_notification_failed'},
        )
