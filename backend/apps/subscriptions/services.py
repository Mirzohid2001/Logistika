from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.utils import timezone

from apps.users.roles import requires_subscription, subscription_audience
from .models import SubscriptionPlan, UserSubscription


def user_requires_subscription(user) -> bool:
    return requires_subscription(user)


def get_active_subscription(user) -> UserSubscription | None:
    if not user or not user.is_authenticated:
        return None
    now = timezone.now()
    subscription = (
        UserSubscription.objects.select_related('plan')
        .filter(user=user, status='active', expires_at__gt=now)
        .order_by('-expires_at')
        .first()
    )
    return subscription


def user_has_active_subscription(user) -> bool:
    if not user_requires_subscription(user):
        return True
    return get_active_subscription(user) is not None


def user_has_marketplace_access(user) -> bool:
    """Paid subscription OR remaining free trial uses."""
    if not subscriptions_enforced():
        return True
    if not user_requires_subscription(user):
        return True
    if get_active_subscription(user) is not None:
        return True
    from .trial import user_has_trial_access
    return user_has_trial_access(user)


def get_subscription_status_payload(user, lang: str = 'ru') -> dict:
    from .trial import get_trial_status_payload

    trial = get_trial_status_payload(user)

    if not subscriptions_enforced() or not user_requires_subscription(user):
        return {
            'required': False,
            'active': True,
            'expires_at': None,
            'plan_code': None,
            'plan_name': None,
            'days_remaining': None,
            'trial': trial,
            'has_access': True,
        }

    active = get_active_subscription(user)
    has_access = active is not None or trial['remaining'] > 0

    if not active:
        return {
            'required': True,
            'active': False,
            'expires_at': None,
            'plan_code': None,
            'plan_name': None,
            'days_remaining': 0,
            'trial': trial,
            'has_access': has_access,
        }

    name_field = f'name_{lang}' if lang in ('ru', 'uz', 'en') else 'name_ru'
    days_remaining = max(0, (active.expires_at - timezone.now()).days)
    return {
        'required': True,
        'active': True,
        'expires_at': active.expires_at.isoformat(),
        'plan_code': active.plan.code,
        'plan_name': getattr(active.plan, name_field, active.plan.name_ru),
        'days_remaining': days_remaining,
        'trial': trial,
        'has_access': True,
    }


def get_plans_for_user(user):
    audience = subscription_audience(user)
    if not audience:
        return SubscriptionPlan.objects.none()
    return SubscriptionPlan.objects.filter(audience=audience, is_active=True).order_by('sort_order', 'price')


def user_eligible_for_intro_offer(user) -> bool:
    """Birinchi intro chegirma — faqat avval intro ishlatilmagan akkauntlar uchun."""
    if not user or not user.is_authenticated:
        return False
    from .models import UserSubscription
    return not UserSubscription.objects.filter(user=user, is_intro_purchase=True).exists()


def calculate_plan_pricing(plan: SubscriptionPlan, user) -> dict:
    list_price = Decimal(plan.price)
    intro_eligible = user_eligible_for_intro_offer(user)
    discount_percent = int(plan.first_period_discount_percent) if intro_eligible else 0
    if intro_eligible and discount_percent > 0:
        charge_amount = plan.intro_price()
        is_intro = True
    else:
        charge_amount = list_price
        is_intro = False

    return {
        'list_price': list_price,
        'charge_amount': charge_amount,
        'currency': plan.currency,
        'intro_eligible': intro_eligible,
        'is_intro_purchase': is_intro,
        'discount_percent': discount_percent,
        'regular_price': list_price,
    }


def activate_subscription(
    user,
    plan: SubscriptionPlan,
    payment=None,
    *,
    list_price=None,
    charged_amount=None,
    intro_discount_percent=0,
    is_intro_purchase=False,
) -> UserSubscription:
    now = timezone.now()
    current = get_active_subscription(user)
    carry_over_days = 0
    if current and current.plan_id != plan.id and current.expires_at > now:
        carry_over_days = max(0, (current.expires_at - now).days)

    if current and current.plan_id == plan.id:
        base = current.expires_at if current.expires_at > now else now
        expires_at = base + timedelta(days=plan.duration_days)
    else:
        expires_at = now + timedelta(days=plan.duration_days + carry_over_days)
    subscription = UserSubscription.objects.create(
        user=user,
        plan=plan,
        status='active',
        started_at=now,
        expires_at=expires_at,
        payment=payment,
        list_price=list_price if list_price is not None else plan.price,
        charged_amount=charged_amount if charged_amount is not None else plan.price,
        intro_discount_percent=intro_discount_percent,
        is_intro_purchase=is_intro_purchase,
    )

    UserSubscription.objects.filter(user=user, status='active').exclude(pk=subscription.pk).update(
        status='expired'
    )
    return subscription


def subscriptions_enforced() -> bool:
    return getattr(settings, 'SUBSCRIPTIONS_ENFORCED', False)
