from django.db.models.signals import pre_delete, pre_save
from django.dispatch import receiver

from apps.users.models import DriverPayoutRequest
from apps.advertisements.models import Advertisement


@receiver(pre_save, sender=DriverPayoutRequest)
def restore_wallet_on_payout_reject(sender, instance: DriverPayoutRequest, **kwargs):
    if not instance.pk:
        return
    previous = DriverPayoutRequest.objects.filter(pk=instance.pk).first()
    if not previous:
        return
    if previous.status == DriverPayoutRequest.STATUS_PENDING and instance.status == DriverPayoutRequest.STATUS_REJECTED:
        from apps.payments.ledger import credit_available
        from apps.payments.models import LedgerEntry

        credit_available(
            instance.user,
            instance.amount,
            entry_type=LedgerEntry.TYPE_PAYOUT_REJECT,
            idempotency_key=f'payout_reject:{instance.id}',
            note=f'Payout request #{instance.id} rejected',
            payout_request=instance,
        )


@receiver(pre_delete, sender=Advertisement)
def release_balances_before_advertisement_delete(sender, instance: Advertisement, **kwargs):
    from apps.payments.balances import release_advertisement_reservations

    release_advertisement_reservations(instance, reason='Advertisement deleted')


# Post-completion debt creation was replaced by prepaid commission balances.
