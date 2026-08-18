"""Restore advertisement bidding after a non-completed order ends."""

from __future__ import annotations

from apps.advertisements.models import Advertisement, AdvertisementExecution
from apps.bids.models import Bid


def reopen_advertisement_marketplace(advertisement: Advertisement) -> None:
    """Re-open ad and clear execution locks from a cancelled or rejected order."""
    advertisement.is_closed = False
    advertisement.save(update_fields=['is_closed', 'updated_at'])

    AdvertisementExecution.objects.filter(advertisement=advertisement).delete()

    Bid.objects.filter(
        advertisement=advertisement,
        is_rejected_by_driver=False,
    ).update(
        is_accepted_by_client=False,
        is_rejected_by_client=False,
    )
