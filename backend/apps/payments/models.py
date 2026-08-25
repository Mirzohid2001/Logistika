from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from decimal import Decimal
from apps.users.models import User
from apps.orders.models import Order


class Payment(models.Model):
    PAYMENT_METHOD_CHOICES = [
        ('click', 'Click'),
        ('payme', 'Payme'),
        ('uzum', 'Uzum'),
        ('mock', 'Mock (development)'),
    ]
    
    PAYMENT_STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('completed', 'Completed'),
        ('failed', 'Failed'),
        ('cancelled', 'Cancelled'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='payments')
    order = models.ForeignKey(Order, on_delete=models.SET_NULL, null=True, blank=True, related_name='payments')
    completion_fee = models.ForeignKey(
        'OrderCompletionFee',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='payments',
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    currency = models.CharField(max_length=3, default='UZS')
    payment_method = models.CharField(max_length=10, choices=PAYMENT_METHOD_CHOICES)
    payment_status = models.CharField(max_length=20, choices=PAYMENT_STATUS_CHOICES, default='pending')
    transaction_id = models.CharField(max_length=100, unique=True, null=True, blank=True)
    gateway_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    paid_at = models.DateTimeField(null=True, blank=True)
    refunded_at = models.DateTimeField(null=True, blank=True)
    refund_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    refund_reason = models.TextField(blank=True, null=True)

    class Meta:
        db_table = 'payments'
        verbose_name = 'Payment'
        verbose_name_plural = 'Payments'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'payment_status', 'created_at']),
            models.Index(fields=['order', 'payment_status']),
            models.Index(fields=['payment_status', 'created_at']),
            models.Index(fields=['transaction_id']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Payment {self.id} - {self.amount} {self.currency}"
    
    @property
    def is_refunded(self):
        if self.refund_amount is None:
            return False
        return self.refund_amount >= self.amount

    @property
    def refundable_amount(self):
        from decimal import Decimal
        refunded = self.refund_amount or Decimal('0')
        return max(Decimal('0'), self.amount - refunded)


class OrderCompletionFeeSettings(models.Model):
    """Singleton admin settings for fees charged after a completed order."""

    CURRENCY_CHOICES = [
        ('UZS', 'UZS (so\'m)'),
    ]

    is_enabled = models.BooleanField(default=False)
    client_fee_enabled = models.BooleanField(default=True)
    driver_fee_enabled = models.BooleanField(default=True)
    client_fee_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))],
    )
    driver_fee_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=0,
        validators=[MinValueValidator(Decimal('0'))],
    )
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='UZS')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_completion_fee_settings'
        verbose_name = 'Order completion fee settings'
        verbose_name_plural = 'Order completion fee settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        self.currency = (self.currency or 'UZS').upper()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return None

    def __str__(self):
        state = 'enabled' if self.is_enabled else 'disabled'
        return f'Order completion fees ({state})'


class OrderCompletionFee(models.Model):
    ROLE_CLIENT = 'client'
    ROLE_DRIVER = 'driver'
    ROLE_CHOICES = [
        (ROLE_CLIENT, 'Client'),
        (ROLE_DRIVER, 'Driver'),
    ]

    STATUS_PENDING = 'pending'
    STATUS_PAID = 'paid'
    STATUS_WAIVED = 'waived'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PAID, 'Paid'),
        (STATUS_WAIVED, 'Waived by admin'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='completion_fees')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='order_completion_fees')
    role = models.CharField(max_length=10, choices=ROLE_CHOICES)
    amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    currency = models.CharField(max_length=3, default='UZS')
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_PENDING)
    paid_payment = models.OneToOneField(
        Payment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='settled_completion_fee',
    )
    paid_at = models.DateTimeField(null=True, blank=True)
    waived_at = models.DateTimeField(null=True, blank=True)
    admin_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_completion_fees'
        ordering = ['-created_at']
        verbose_name = 'Order completion fee'
        verbose_name_plural = 'Order completion fees'
        constraints = [
            models.UniqueConstraint(fields=['order', 'role'], name='unique_completion_fee_order_role'),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='completion_fee_amount_positive'),
        ]
        indexes = [
            models.Index(fields=['user', 'status'], name='completion_user_status_idx'),
            models.Index(fields=['order', 'role'], name='completion_order_role_idx'),
            models.Index(fields=['status', 'created_at'], name='completion_status_created_idx'),
        ]

    def __str__(self):
        return f'Order #{self.order_id} {self.role}: {self.amount} {self.currency} ({self.status})'


class PaymentHistory(models.Model):
    payment = models.ForeignKey(Payment, on_delete=models.CASCADE, related_name='history')
    status = models.CharField(max_length=20)
    status_new = models.CharField(max_length=20)
    gateway_response = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'payment_history'
        verbose_name = 'Payment History'
        verbose_name_plural = 'Payment Histories'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['payment', 'created_at']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"History for Payment {self.payment.id}"


class Wallet(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='wallet')
    available = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    held = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    legacy_seeded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'wallets'

    def __str__(self):
        return f"Wallet {self.user_id} avail={self.available} held={self.held}"


class LedgerEntry(models.Model):
    TYPE_LEGACY_SEED = 'legacy_seed'
    TYPE_ESCROW_FUND = 'escrow_fund'
    TYPE_ESCROW_RELEASE = 'escrow_release'
    TYPE_COMMISSION = 'commission'
    TYPE_CANCELLATION_FEE = 'cancellation_fee'
    TYPE_REFUND = 'refund'
    TYPE_DISPUTE_HOLD = 'dispute_hold'
    TYPE_DISPUTE_RELEASE = 'dispute_release'
    TYPE_PAYOUT_RESERVE = 'payout_reserve'
    TYPE_PAYOUT_REJECT = 'payout_reject'

    TYPE_CHOICES = [
        (TYPE_LEGACY_SEED, 'Legacy seed'),
        (TYPE_ESCROW_FUND, 'Escrow fund'),
        (TYPE_ESCROW_RELEASE, 'Escrow release'),
        (TYPE_COMMISSION, 'Platform commission'),
        (TYPE_CANCELLATION_FEE, 'Cancellation fee'),
        (TYPE_REFUND, 'Refund'),
        (TYPE_DISPUTE_HOLD, 'Dispute hold'),
        (TYPE_DISPUTE_RELEASE, 'Dispute release'),
        (TYPE_PAYOUT_RESERVE, 'Payout reserve'),
        (TYPE_PAYOUT_REJECT, 'Payout reject'),
    ]

    wallet = models.ForeignKey(
        Wallet,
        on_delete=models.CASCADE,
        related_name='entries',
        null=True,
        blank=True,
        help_text='Null = platform ledger (commission)',
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
    )
    payment = models.ForeignKey(
        Payment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
    )
    complaint = models.ForeignKey(
        'ratings.Complaint',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
    )
    payout_request = models.ForeignKey(
        'users.DriverPayoutRequest',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='ledger_entries',
    )
    entry_type = models.CharField(max_length=32, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    available_delta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    held_delta = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    idempotency_key = models.CharField(max_length=120, unique=True)
    note = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'ledger_entries'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at']),
            models.Index(fields=['order', 'entry_type']),
            models.Index(fields=['entry_type', 'created_at']),
        ]

    def __str__(self):
        return f"{self.entry_type} {self.amount} key={self.idempotency_key}"


class OrderEscrow(models.Model):
    STATUS_EMPTY = 'empty'
    STATUS_FUNDED = 'funded'
    STATUS_HELD = 'held'
    STATUS_RELEASED = 'released'
    STATUS_REFUNDED = 'refunded'
    STATUS_CANCELLED = 'cancelled'

    STATUS_CHOICES = [
        (STATUS_EMPTY, 'Empty'),
        (STATUS_FUNDED, 'Funded'),
        (STATUS_HELD, 'Held'),
        (STATUS_RELEASED, 'Released'),
        (STATUS_REFUNDED, 'Refunded'),
        (STATUS_CANCELLED, 'Cancelled'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='escrow')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_EMPTY)
    funded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    released_to_driver = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    commission_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    refunded_amount = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    cancellation_fee = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    funded_at = models.DateTimeField(null=True, blank=True)
    held_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_escrows'

    def __str__(self):
        return f"Escrow order={self.order_id} {self.status} {self.funded_amount}"
