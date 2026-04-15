from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import DispatcherAssignment, DispatcherNote, DispatcherExceptionAction


@admin.register(DispatcherAssignment, site=admin_site)
class DispatcherAssignmentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'dispatcher', 'order', 'assigned_driver', 'status', 'assigned_at', 'created_at']
    list_filter = ['status', 'assigned_at', 'created_at']
    search_fields = ['dispatcher__phone', 'dispatcher__first_name', 'dispatcher__last_name', 'order__id', 'assigned_driver__phone']
    readonly_fields = ['assigned_at', 'reassigned_at', 'created_at', 'updated_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('dispatcher', 'order', 'assigned_driver', 'status')
        }),
        ('Vaqt', {
            'fields': ('assigned_at', 'reassigned_at', 'created_at', 'updated_at')
        }),
        ('Eslatmalar', {
            'fields': ('notes',)
        }),
    )


@admin.register(DispatcherNote, site=admin_site)
class DispatcherNoteAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'dispatcher', 'order', 'created_at']
    list_filter = ['created_at']
    search_fields = ['dispatcher__phone', 'order__id', 'note']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('dispatcher', 'order', 'note')
        }),
        ('Vaqt', {
            'fields': ('created_at',)
        }),
    )


@admin.register(DispatcherExceptionAction, site=admin_site)
class DispatcherExceptionActionAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'dispatcher', 'order', 'exception_type', 'acknowledged_at', 'snoozed_until', 'updated_at']
    list_filter = ['exception_type', 'acknowledged_at', 'snoozed_until', 'updated_at']
    search_fields = ['dispatcher__phone', 'order__id', 'exception_type', 'note']
    readonly_fields = ['created_at', 'updated_at']
