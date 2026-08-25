from django.db.models.signals import post_save, pre_save
from django.dispatch import receiver

from apps.orders.models import Order
from apps.users.models import DriverPayoutRequest


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


@receiver(post_save, sender=Order)
def create_fees_when_order_is_completed(sender, instance: Order, created, update_fields=None, **kwargs):
    if not created and update_fields is not None and 'status' not in update_fields:
        return
    if not instance.status_id or instance.status.code != 'completed':
        return

    from apps.payments.completion_fees import create_completion_fees_for_order

    create_completion_fees_for_order(instance)
