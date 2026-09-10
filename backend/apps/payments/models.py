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
    """Singleton admin settings for prepaid per-order commissions."""

    CURRENCY_CHOICES = [
        ('UZS', 'UZS (so\'m)'),
        ('USD', 'USD ($)'),
    ]

    is_enabled = models.BooleanField(default=True)
    client_fee_enabled = models.BooleanField(default=True)
    driver_fee_enabled = models.BooleanField(default=True)
    client_fee_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=50,
        validators=[MinValueValidator(Decimal('0'))],
    )
    driver_fee_amount = models.DecimalField(
        max_digits=12,
        decimal_places=2,
        default=50,
        validators=[MinValueValidator(Decimal('0'))],
    )
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES, default='USD')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_completion_fee_settings'
        verbose_name = 'Prepaid order commission settings'
        verbose_name_plural = 'Prepaid order commission settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        self.currency = (self.currency or 'USD').upper()
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return None

    def __str__(self):
        state = 'enabled' if self.is_enabled else 'disabled'
        return f'Prepaid order commissions ({state})'


class BalanceExchangeRateSettings(models.Model):
    """Singleton rate used when a UZS-only gateway funds a USD balance."""

    usd_to_uzs = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        default=13000,
        validators=[MinValueValidator(Decimal('1'))],
        help_text="UZS charged by the gateway for each 1 USD credited to a balance.",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'balance_exchange_rate_settings'
        verbose_name = 'Balance exchange rate settings'
        verbose_name_plural = 'Balance exchange rate settings'

    def save(self, *args, **kwargs):
        self.pk = 1
        return super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        return None

    def __str__(self):
        return f'1 USD = {self.usd_to_uzs} UZS'


class AccountBalance(models.Model):
    """One canonical balance per user and purpose.

    Order funds are stored in UZS and commission funds in USD.  The API can
    present either balance in UZS or USD without creating a second wallet.
    """

    TYPE_ORDER = 'order'
    TYPE_COMMISSION = 'commission'
    TYPE_CHOICES = [
        (TYPE_ORDER, 'Order balance'),
        (TYPE_COMMISSION, 'Commission balance'),
    ]
    CURRENCY_CHOICES = [
        ('UZS', 'UZS (so\'m)'),
        ('USD', 'USD ($)'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='account_balances')
    balance_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    currency = models.CharField(max_length=3, choices=CURRENCY_CHOICES)
    available = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reserved = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'account_balances'
        ordering = ['balance_type']
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'balance_type'],
                name='unique_user_balance_type',
            ),
            models.CheckConstraint(condition=models.Q(available__gte=0), name='account_balance_available_nonnegative'),
            models.CheckConstraint(condition=models.Q(reserved__gte=0), name='account_balance_reserved_nonnegative'),
        ]
        indexes = [
            models.Index(fields=['user', 'balance_type'], name='account_balance_user_type_idx'),
        ]

    def __str__(self):
        return (
            f'{self.user_id} {self.balance_type} {self.currency}: '
            f'{self.available} available, {self.reserved} reserved'
        )


class BalanceReservation(models.Model):
    """Immutable-purpose hold that prevents the same funds funding two orders."""

    PURPOSE_CLIENT_ORDER = 'client_order'
    PURPOSE_CLIENT_COMMISSION = 'client_commission'
    PURPOSE_DRIVER_COMMISSION = 'driver_commission'
    PURPOSE_CHOICES = [
        (PURPOSE_CLIENT_ORDER, 'Client order funds'),
        (PURPOSE_CLIENT_COMMISSION, 'Client commission'),
        (PURPOSE_DRIVER_COMMISSION, 'Driver commission'),
    ]
    STATUS_HELD = 'held'
    STATUS_CAPTURED = 'captured'
    STATUS_RELEASED = 'released'
    STATUS_CHOICES = [
        (STATUS_HELD, 'Held'),
        (STATUS_CAPTURED, 'Captured'),
        (STATUS_RELEASED, 'Released'),
    ]

    balance = models.ForeignKey(AccountBalance, on_delete=models.PROTECT, related_name='reservations')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='balance_reservations')
    advertisement = models.ForeignKey(
        'advertisements.Advertisement',
        on_delete=models.CASCADE,
        related_name='balance_reservations',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='balance_reservations',
    )
    purpose = models.CharField(max_length=24, choices=PURPOSE_CHOICES)
    amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
    )
    currency = models.CharField(max_length=3, choices=AccountBalance.CURRENCY_CHOICES)
    balance_amount = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        validators=[MinValueValidator(Decimal('0.01'))],
        help_text='Amount held in the canonical currency of the linked balance.',
    )
    settlement_uzs_rate = models.DecimalField(
        max_digits=14,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal('1'))],
        help_text='Locked UZS rate used to pay the driver; set only for client order funds.',
    )
    status = models.CharField(max_length=12, choices=STATUS_CHOICES, default=STATUS_HELD)
    captured_at = models.DateTimeField(null=True, blank=True)
    released_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'balance_reservations'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['advertisement', 'purpose'],
                condition=models.Q(status='held'),
                name='unique_held_advertisement_balance_purpose',
            ),
            models.CheckConstraint(condition=models.Q(amount__gt=0), name='balance_reservation_amount_positive'),
        ]
        indexes = [
            models.Index(fields=['user', 'status'], name='balance_res_user_status_idx'),
            models.Index(fields=['order', 'purpose'], name='balance_res_order_purpose_idx'),
        ]

    def __str__(self):
        return (
            f'{self.purpose} ad={self.advertisement_id}: {self.amount} {self.currency} '
            f'({self.balance_amount} {self.balance.currency}, {self.status})'
        )


class BalanceEntry(models.Model):
    TYPE_TOP_UP = 'top_up'
    TYPE_RESERVE = 'reserve'
    TYPE_RELEASE = 'release'
    TYPE_CAPTURE = 'capture'
    TYPE_ADMIN_ADJUSTMENT = 'admin_adjustment'
    TYPE_CHOICES = [
        (TYPE_TOP_UP, 'Top up'),
        (TYPE_RESERVE, 'Reserve'),
        (TYPE_RELEASE, 'Release'),
        (TYPE_CAPTURE, 'Capture'),
        (TYPE_ADMIN_ADJUSTMENT, 'Admin adjustment'),
    ]

    balance = models.ForeignKey(AccountBalance, on_delete=models.PROTECT, related_name='entries')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='balance_entries')
    reservation = models.ForeignKey(
        BalanceReservation,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='entries',
    )
    advertisement = models.ForeignKey(
        'advertisements.Advertisement',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='balance_entries',
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='balance_entries',
    )
    payment = models.ForeignKey(
        Payment,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='balance_entries',
    )
    entry_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    amount = models.DecimalField(max_digits=14, decimal_places=2)
    available_delta = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reserved_delta = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    idempotency_key = models.CharField(max_length=160, unique=True)
    note = models.CharField(max_length=255, blank=True, default='')
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'balance_entries'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'created_at'], name='balance_entry_user_date_idx'),
            models.Index(fields=['entry_type', 'created_at'], name='balance_entry_type_date_idx'),
        ]

    def __str__(self):
        return f'{self.entry_type} {self.amount} key={self.idempotency_key}'


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
