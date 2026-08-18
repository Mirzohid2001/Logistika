from django.conf import settings
from django.db import models
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
