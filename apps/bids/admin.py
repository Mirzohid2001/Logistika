from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import Bid


@admin.register(Bid)
class BidAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['advertisement', 'driver', 'client', 'is_accepted_by_client', 'is_rejected_by_client', 'created_at']
    list_filter = ['is_accepted_by_client', 'is_rejected_by_client', 'is_rejected_by_driver', 'created_at']
    search_fields = ['advertisement__title', 'driver__phone', 'client__phone']
    readonly_fields = ['created_at', 'updated_at']
