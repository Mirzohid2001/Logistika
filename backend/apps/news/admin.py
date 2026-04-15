from django.contrib import admin
from django.utils.html import format_html
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import News


@admin.register(News, site=admin_site)
class NewsAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['title_ru', 'date', 'photo_display', 'created_at']
    list_filter = ['date', 'created_at']
    search_fields = ['title_ru', 'title_en', 'title_uz', 'text_ru', 'text_en', 'text_uz']
    readonly_fields = ['created_at', 'updated_at', 'photo_display']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('title_ru', 'title_en', 'title_uz', 'date')
        }),
        ('Matn', {
            'fields': ('text_ru', 'text_en', 'text_uz')
        }),
        ('Rasm', {
            'fields': ('photo', 'photo_display')
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def photo_display(self, obj):
        if obj.photo:
            return format_html('<img src="{}" style="max-width: 200px; max-height: 200px;" />', obj.photo.url)
        return format_html('<span style="color: #999;">Rasm yo\'q</span>')
    photo_display.short_description = 'Rasm'
