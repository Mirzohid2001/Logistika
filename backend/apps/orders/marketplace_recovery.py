"""Restore advertisement bidding after a non-completed order ends."""

from __future__ import annotations

from django.db import transaction

from apps.advertisements.models import Advertisement, AdvertisementExecution
from apps.bids.models import Bid


@transaction.atomic
def reopen_advertisement_marketplace(advertisement: Advertisement) -> bool:
    """Re-open a funded ad and clear execution locks after an order ends."""
    advertisement = Advertisement.objects.select_for_update().get(pk=advertisement.pk)

    AdvertisementExecution.objects.filter(advertisement=advertisement).delete()

    Bid.objects.filter(
        advertisement=advertisement,
        is_rejected_by_driver=False,
    ).update(
        is_accepted_by_client=False,
        is_rejected_by_client=False,
    )

    from apps.payments.balances import (
        InsufficientBalanceError,
        release_advertisement_reservations,
        reserve_advertisement_balances,
    )

    try:
        reserve_advertisement_balances(advertisement)
    except (InsufficientBalanceError, ValueError):
        # Never expose an unfunded listing to drivers. Any transport hold left
        # from the ended order is returned so the client can fund a fresh ad.
        release_advertisement_reservations(
            advertisement,
            reason='Advertisement could not be re-opened with sufficient prepaid balances',
        )
        advertisement.is_closed = True
        advertisement.save(update_fields=['is_closed', 'updated_at'])
        return False

    advertisement.is_closed = False
    advertisement.save(update_fields=['is_closed', 'updated_at'])
    return True
