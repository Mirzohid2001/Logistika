from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import UpdateLog


@admin.register(UpdateLog, site=admin_site)
class UpdateLogAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'updater', 'order', 'update_type', 'created_at']
    list_filter = ['update_type', 'created_at']
    search_fields = ['updater__phone', 'order__id', 'description']
    readonly_fields = ['created_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('updater', 'order', 'update_type')
        }),
        ('Qiymatlar', {
            'fields': ('old_value', 'new_value', 'description')
        }),
        ('Vaqt', {
            'fields': ('created_at',)
        }),
    )
