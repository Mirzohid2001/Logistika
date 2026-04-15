from django.contrib import admin
from django.utils.html import format_html
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Vehicle


@admin.register(Vehicle, site=admin_site)
class VehicleAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['number', 'make', 'model', 'user', 'cargo_volume', 'load_capacity', 'is_verified', 'photo_display', 'created_at']
    list_filter = ['is_verified', 'created_at', 'make']
    search_fields = ['number', 'make', 'model', 'user__phone', 'user__first_name', 'user__last_name']
    readonly_fields = ['created_at', 'updated_at', 'photo_display', 'document_photos_display']
    list_editable = ['is_verified']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('user', 'make', 'model', 'number')
        }),
        ('Texnik xususiyatlar', {
            'fields': ('cargo_volume', 'load_capacity')
        }),
        ('Rasmlar', {
            'fields': ('photo', 'photo_display', 'document_photos_display')
        }),
        ('Tasdiqlash', {
            'fields': ('is_verified',)
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def photo_display(self, obj):
        if obj.photo:
            return format_html('<img src="{}" style="max-width: 200px; max-height: 200px;" />', obj.photo.url)
        return format_html('<span style="color: #999;">Rasm yo\'q</span>')
    photo_display.short_description = 'Mashina rasmi'
    
    def document_photos_display(self, obj):
        if obj.document_photos and len(obj.document_photos) > 0:
            images_html = ''
            for photo in obj.document_photos:
                images_html += f'<img src="{photo}" style="max-width: 200px; margin: 5px; border: 1px solid #ddd; border-radius: 4px;" />'
            return format_html(images_html)
        return format_html('<span style="color: #999;">Hujjatlar yo\'q</span>')
    document_photos_display.short_description = 'Hujjatlar'
