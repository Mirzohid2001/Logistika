from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import StaticContent


@admin.register(StaticContent, site=admin_site)
class StaticContentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['content_type', 'updated_at']
    search_fields = ['content_type']
    readonly_fields = ['updated_at']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('content_type',)
        }),
        ('Kontent (RU)', {
            'fields': ('content_ru',)
        }),
        ('Kontent (EN)', {
            'fields': ('content_en',)
        }),
        ('Kontent (UZ)', {
            'fields': ('content_uz',)
        }),
        ('Vaqt', {
            'fields': ('updated_at',)
        }),
    )