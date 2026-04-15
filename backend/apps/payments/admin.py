from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Payment, PaymentHistory


@admin.register(Payment, site=admin_site)
class PaymentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'user', 'order', 'amount', 'currency', 'payment_method', 'payment_status', 'created_at']
    list_filter = ['payment_method', 'payment_status', 'created_at', 'currency']
    search_fields = ['user__phone', 'transaction_id', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at', 'paid_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('user', 'order', 'amount', 'currency')
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


@admin.register(PaymentHistory, site=admin_site)
class PaymentHistoryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['payment', 'status', 'status_new', 'created_at']
    list_filter = ['status', 'status_new', 'created_at']
    search_fields = ['payment__id', 'payment__transaction_id']
    readonly_fields = ['created_at']
