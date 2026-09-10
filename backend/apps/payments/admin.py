from django.contrib import admin
from django.utils import timezone
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import (
    AccountBalance,
    BalanceExchangeRateSettings,
    BalanceEntry,
    BalanceReservation,
    LedgerEntry,
    OrderCompletionFee,
    OrderCompletionFeeSettings,
    OrderEscrow,
    Payment,
    PaymentHistory,
    Wallet,
)


@admin.register(BalanceExchangeRateSettings, site=admin_site)
class BalanceExchangeRateSettingsAdmin(OperatorMixin, admin.ModelAdmin):
    fields = ['usd_to_uzs', 'updated_at']
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not BalanceExchangeRateSettings.objects.exists() and super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(AccountBalance, site=admin_site)
class AccountBalanceAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'user', 'balance_type', 'currency', 'available', 'reserved', 'updated_at']
    list_filter = ['balance_type']
    search_fields = ['user__phone', 'user__first_name', 'user__last_name']
    readonly_fields = ['user', 'balance_type', 'currency', 'available', 'reserved', 'created_at', 'updated_at']

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BalanceReservation, site=admin_site)
class BalanceReservationAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = [
        'id', 'purpose', 'user', 'advertisement', 'order', 'amount', 'currency',
        'balance_amount', 'status',
    ]
    list_filter = ['purpose', 'status', 'currency']
    search_fields = ['user__phone', 'advertisement__id', 'order__id']
    readonly_fields = [
        'balance', 'user', 'advertisement', 'order', 'purpose', 'amount', 'currency', 'balance_amount',
        'settlement_uzs_rate', 'status', 'captured_at', 'released_at', 'created_at', 'updated_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(BalanceEntry, site=admin_site)
class BalanceEntryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'entry_type', 'user', 'amount', 'available_delta', 'reserved_delta', 'created_at']
    list_filter = ['entry_type', 'balance__currency', 'created_at']
    search_fields = ['user__phone', 'idempotency_key', 'note']
    readonly_fields = [
        'balance', 'user', 'reservation', 'advertisement', 'order', 'payment', 'entry_type',
        'amount', 'available_delta', 'reserved_delta', 'idempotency_key', 'note', 'metadata', 'created_at',
    ]

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Payment, site=admin_site)
class PaymentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'user', 'order', 'completion_fee', 'amount', 'currency', 'payment_method', 'payment_status', 'created_at']
    list_filter = ['payment_method', 'payment_status', 'created_at', 'currency']
    search_fields = ['user__phone', 'transaction_id', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at', 'paid_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('user', 'order', 'completion_fee', 'amount', 'currency')
        }),
        ('To\'lov ma\'lumotlari', {
            'fields': ('payment_method', 'payment_status', 'transaction_id')
        }),
        ('Gateway javob', {
            'fields': ('gateway_response',)
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at', 'paid_at')
        }),
    )


@admin.register(Wallet, site=admin_site)
class WalletAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'user', 'available', 'held', 'legacy_seeded', 'updated_at']
    search_fields = ['user__phone']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(LedgerEntry, site=admin_site)
class LedgerEntryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'entry_type', 'user', 'order', 'amount', 'available_delta', 'held_delta', 'created_at']
    list_filter = ['entry_type', 'created_at']
    search_fields = ['idempotency_key', 'user__phone', 'note']
    readonly_fields = ['created_at']


@admin.register(OrderEscrow, site=admin_site)
class OrderEscrowAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'order', 'status', 'funded_amount', 'released_to_driver', 'commission_amount', 'refunded_amount']
    list_filter = ['status']


@admin.register(PaymentHistory, site=admin_site)
class PaymentHistoryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['payment', 'status', 'status_new', 'created_at']
    list_filter = ['status', 'status_new', 'created_at']
    search_fields = ['payment__id', 'payment__transaction_id']
    readonly_fields = ['created_at']


@admin.register(OrderCompletionFeeSettings, site=admin_site)
class OrderCompletionFeeSettingsAdmin(OperatorMixin, admin.ModelAdmin):
    fieldsets = (
        ('Oldindan to\'lanadigan komissiya', {
            'fields': ('is_enabled', 'currency', 'updated_at'),
        }),
        ('Mijoz uchun (har bir buyurtma)', {
            'fields': ('client_fee_enabled', 'client_fee_amount'),
        }),
        ('Haydovchi uchun (har bir buyurtma)', {
            'fields': ('driver_fee_enabled', 'driver_fee_amount'),
        }),
    )
    readonly_fields = ['updated_at']

    def has_add_permission(self, request):
        return not OrderCompletionFeeSettings.objects.exists() and super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(OrderCompletionFee, site=admin_site)
class OrderCompletionFeeAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = [
        'id', 'order', 'user', 'role', 'amount', 'currency', 'status', 'paid_payment', 'created_at',
    ]
    list_filter = ['status', 'role', 'currency', 'created_at']
    search_fields = ['user__phone', 'user__first_name', 'user__last_name', 'order__id']
    readonly_fields = [
        'order', 'user', 'role', 'amount', 'currency', 'status', 'paid_payment',
        'paid_at', 'waived_at', 'created_at', 'updated_at',
    ]
    actions = ['waive_selected_fees']

    @admin.action(description='Tanlangan kutilayotgan xizmat to\'lovlarini bekor qilish')
    def waive_selected_fees(self, request, queryset):
        updated = queryset.filter(status=OrderCompletionFee.STATUS_PENDING).update(
            status=OrderCompletionFee.STATUS_WAIVED,
            waived_at=timezone.now(),
            updated_at=timezone.now(),
        )
        self.message_user(request, f'{updated} ta xizmat to\'lovi bekor qilindi.')

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False
