from decimal import Decimal, ROUND_HALF_UP

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.utils import timezone

from apps.users.models import User


class SubscriptionPlan(models.Model):
    AUDIENCE_CHOICES = [
        ('client', 'Client'),
        ('driver', 'Driver'),
    ]

    code = models.CharField(max_length=50, unique=True)
    audience = models.CharField(max_length=20, choices=AUDIENCE_CHOICES)
    name_ru = models.CharField(max_length=120)
    name_uz = models.CharField(max_length=120)
    name_en = models.CharField(max_length=120)
    description_ru = models.TextField(blank=True, default='')
    description_uz = models.TextField(blank=True, default='')
    description_en = models.TextField(blank=True, default='')
    price = models.DecimalField(max_digits=12, decimal_places=2, help_text='Keyingi oylar uchun to\'liq narx')
    first_period_discount_percent = models.PositiveSmallIntegerField(
        default=50,
        validators=[MinValueValidator(0), MaxValueValidator(100)],
        help_text='Birinchi obuna uchun chegirma foizi (masalan 50 = -50%)',
    )
    currency = models.CharField(max_length=3, default='UZS')
    duration_days = models.PositiveIntegerField(default=30)
    is_active = models.BooleanField(default=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'subscription_plans'
        ordering = ['sort_order', 'price']

    def __str__(self):
        return f'{self.code} ({self.audience})'

    def intro_price(self) -> Decimal:
        discount = Decimal(self.first_period_discount_percent) / Decimal('100')
        amount = self.price * (Decimal('1') - discount)
        return amount.quantize(Decimal('1'), rounding=ROUND_HALF_UP)


class UserSubscription(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('cancelled', 'Cancelled'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='subscriptions')
    plan = models.ForeignKey(SubscriptionPlan, on_delete=models.PROTECT, related_name='user_subscriptions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    started_at = models.DateTimeField(default=timezone.now)
    expires_at = models.DateTimeField()
    payment = models.ForeignKey(
        'payments.Payment',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='subscription_purchases',
    )
    list_price = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='To\'liq narx (chegirmasiz)',
    )
    charged_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        null=True,
        blank=True,
        help_text='Foydalanuvchi to\'lagan summa',
    )
    intro_discount_percent = models.PositiveSmallIntegerField(default=0)
    is_intro_purchase = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_subscriptions'
        ordering = ['-expires_at']
        indexes = [
            models.Index(fields=['user', 'status', 'expires_at']),
        ]

    @property
    def is_active_now(self) -> bool:
        return self.status == 'active' and self.expires_at > timezone.now()

    def __str__(self):
        return f'{self.user_id} → {self.plan.code} ({self.status})'


class MarketplaceTrialAccount(models.Model):
    """Free trial uses before subscription (per marketplace user)."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='marketplace_trial')
    free_uses_granted = models.PositiveSmallIntegerField(default=3)
    free_uses_consumed = models.PositiveSmallIntegerField(default=0)
    trial_disabled = models.BooleanField(
        default=False,
        help_text='Admin yoki qurilma qayta ishlatilganda trial o\'chiriladi',
    )
    disabled_reason = models.CharField(max_length=50, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'marketplace_trial_accounts'

    @property
    def uses_remaining(self) -> int:
        if self.trial_disabled:
            return 0
        return max(0, int(self.free_uses_granted) - int(self.free_uses_consumed))

    def __str__(self):
        return f'trial user={self.user_id} {self.uses_remaining}/{self.free_uses_granted}'


class TrialDeviceGrant(models.Model):
    """Bitta qurilmada faqat bitta akkaunt trial oladi (anti-abuse)."""
    device_id = models.CharField(max_length=128, unique=True)
    granted_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='trial_device_grants')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trial_device_grants'

    def __str__(self):
        return f'device={self.device_id[:16]}… user={self.granted_user_id}'


class TrialUseLog(models.Model):
    """Trial sarfi buyurtma bo‘yicha qayd etiladi — bekor qilinganda qaytariladi."""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='trial_use_logs')
    order = models.ForeignKey('orders.Order', on_delete=models.CASCADE, related_name='trial_use_logs')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'trial_use_logs'
        constraints = [
            models.UniqueConstraint(fields=['user', 'order'], name='trial_use_log_user_order_uniq'),
        ]

    def __str__(self):
        return f'trial use user={self.user_id} order={self.order_id}'
