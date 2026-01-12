from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import Vehicle


@admin.register(Vehicle)
class VehicleAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['number', 'make', 'model', 'user', 'cargo_volume', 'load_capacity', 'is_verified', 'created_at']
    list_filter = ['is_verified', 'created_at']
    search_fields = ['number', 'make', 'model', 'user__phone']
    readonly_fields = ['created_at', 'updated_at']
