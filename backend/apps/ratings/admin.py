from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Rating


@admin.register(Rating, site=admin_site)
class RatingAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'order', 'from_user', 'to_user', 'rating', 'created_at']
    list_filter = ['rating', 'created_at']
    search_fields = ['from_user__phone', 'to_user__phone', 'order__id', 'comment']
    readonly_fields = ['created_at', 'updated_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('order', 'from_user', 'to_user', 'rating', 'comment')
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )
