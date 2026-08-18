from django.conf import settings
from django.db import transaction
from django.db.models import F

from apps.users.roles import requires_subscription

from .models import MarketplaceTrialAccount, TrialDeviceGrant, TrialUseLog


def free_trial_limit() -> int:
    return max(0, int(getattr(settings, 'SUBSCRIPTION_FREE_TRIAL_USES', 3)))


def one_trial_account_per_device() -> bool:
    return bool(getattr(settings, 'SUBSCRIPTION_TRIAL_ONE_ACCOUNT_PER_DEVICE', True))


def device_id_required_on_register() -> bool:
    from .services import subscriptions_enforced

    if not subscriptions_enforced():
        return False
    return bool(getattr(settings, 'SUBSCRIPTION_REQUIRE_DEVICE_ID_ON_REGISTER', True))


def normalize_device_id(device_id: str | None) -> str | None:
    if not device_id:
        return None
    cleaned = device_id.strip()[:128]
    if len(cleaned) < 8:
        return None
    return cleaned


def device_trial_already_claimed(device_id: str, *, exclude_user_id: int | None = None) -> bool:
    device_id = normalize_device_id(device_id)
    if not device_id:
        return False
    qs = TrialDeviceGrant.objects.filter(device_id=device_id)
    if exclude_user_id:
        qs = qs.exclude(granted_user_id=exclude_user_id)
    return qs.exists()


def get_trial_account(user) -> MarketplaceTrialAccount | None:
    if not user or not user.is_authenticated or not requires_subscription(user):
        return None
    return MarketplaceTrialAccount.objects.filter(user=user).first()


def initialize_marketplace_trial(user, device_id: str | None = None) -> MarketplaceTrialAccount | None:
    """Assign trial quota once at registration (or first login for legacy users)."""
    if not requires_subscription(user):
        return None

    device_id = normalize_device_id(device_id)
    granted = free_trial_limit()
    disabled = False
    reason = ''

    if one_trial_account_per_device():
        if not device_id:
            granted = 0
            disabled = True
            reason = 'device_missing'
        elif device_trial_already_claimed(device_id, exclude_user_id=user.id):
            granted = 0
            disabled = True
            reason = 'device_reuse'
        else:
            TrialDeviceGrant.objects.get_or_create(
                device_id=device_id,
                defaults={'granted_user': user},
            )

    account, created = MarketplaceTrialAccount.objects.get_or_create(
        user=user,
        defaults={
            'free_uses_granted': granted,
            'trial_disabled': disabled,
            'disabled_reason': reason,
        },
    )
    if created:
        return account

    if disabled and account.uses_remaining > 0:
        account.free_uses_granted = 0
        account.trial_disabled = True
        account.disabled_reason = reason
        account.save(update_fields=['free_uses_granted', 'trial_disabled', 'disabled_reason', 'updated_at'])
    return account


def ensure_user_trial_initialized(user, device_id: str | None = None) -> MarketplaceTrialAccount | None:
    """Legacy users: bind trial on first login with device. Never re-grant after initialization."""
    existing = get_trial_account(user)
    if existing:
        return existing
    return initialize_marketplace_trial(user, device_id=device_id)


def get_trial_uses_remaining(user) -> int:
    account = get_trial_account(user)
    if not account:
        return 0
    return account.uses_remaining


def user_has_trial_access(user) -> bool:
    return get_trial_uses_remaining(user) > 0


def ensure_marketplace_action_allowed(user):
    """Raise PermissionDeniedError if user cannot perform a billable marketplace action."""
    from apps.common.exceptions import PermissionDeniedError
    from .services import get_active_subscription, subscriptions_enforced

    if not subscriptions_enforced():
        return
    if not requires_subscription(user):
        return
    if get_active_subscription(user):
        return
    if user_has_trial_access(user):
        return
    raise PermissionDeniedError(
        detail='Bepul sinov tugadi. Davom etish uchun obuna sotib oling.',
        code='subscription_required',
    )


def consume_trial_use_for_user(user, *, order_id: int | None = None) -> bool:
    """Consume one trial use if user has no active subscription. Returns True if consumed."""
    from .services import get_active_subscription, subscriptions_enforced

    if not subscriptions_enforced():
        return False
    if not requires_subscription(user):
        return False
    if get_active_subscription(user):
        return False

    account = get_trial_account(user)
    if not account or account.uses_remaining <= 0:
        return False

    updated = MarketplaceTrialAccount.objects.filter(
        pk=account.pk,
        free_uses_consumed__lt=F('free_uses_granted'),
        trial_disabled=False,
    ).update(free_uses_consumed=F('free_uses_consumed') + 1)

    if updated > 0 and order_id is not None:
        TrialUseLog.objects.get_or_create(user=user, order_id=order_id)

    return updated > 0


def restore_trial_use_for_user(user, *, order_id: int) -> bool:
    """Bekor qilingan buyurtma uchun sarflangan trialni qaytaradi."""
    from .services import get_active_subscription, subscriptions_enforced

    if not subscriptions_enforced():
        return False
    if not requires_subscription(user):
        return False
    if get_active_subscription(user):
        return False

    log = TrialUseLog.objects.filter(user=user, order_id=order_id).first()
    if not log:
        return False

    account = get_trial_account(user)
    if not account or account.free_uses_consumed <= 0:
        log.delete()
        return False

    MarketplaceTrialAccount.objects.filter(
        pk=account.pk,
        free_uses_consumed__gt=0,
    ).update(free_uses_consumed=F('free_uses_consumed') - 1)
    log.delete()
    return True


@transaction.atomic
def restore_trial_for_order(order) -> None:
    restore_trial_use_for_user(order.client, order_id=order.id)
    restore_trial_use_for_user(order.driver, order_id=order.id)


@transaction.atomic
def consume_trial_for_order(order) -> None:
    """Bitta buyurtma uchun faqat mijoz trialini sarflaydi (haydovchi allaqachon tekshirilgan)."""
    consume_trial_use_for_user(order.client, order_id=order.id)


def get_trial_status_payload(user) -> dict:
    if not requires_subscription(user):
        return {
            'enabled': False,
            'granted': 0,
            'consumed': 0,
            'remaining': 0,
            'disabled': False,
            'disabled_reason': None,
        }
    account = get_trial_account(user)
    if not account:
        return {
            'enabled': True,
            'granted': 0,
            'consumed': 0,
            'remaining': 0,
            'disabled': False,
            'disabled_reason': 'not_initialized',
        }
    return {
        'enabled': True,
        'granted': account.free_uses_granted,
        'consumed': account.free_uses_consumed,
        'remaining': account.uses_remaining,
        'disabled': account.trial_disabled,
        'disabled_reason': account.disabled_reason or None,
    }
