from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import Payment, PaymentHistory


@admin.register(Payment)
class PaymentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'user', 'amount', 'currency', 'payment_method', 'payment_status', 'created_at']
    list_filter = ['payment_method', 'payment_status', 'created_at']
    search_fields = ['user__phone', 'transaction_id']
    readonly_fields = ['created_at', 'updated_at', 'paid_at']


@admin.register(PaymentHistory)
class PaymentHistoryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['payment', 'status', 'status_new', 'created_at']
    list_filter = ['status', 'status_new', 'created_at']
    search_fields = ['payment__id']
    readonly_fields = ['created_at']
