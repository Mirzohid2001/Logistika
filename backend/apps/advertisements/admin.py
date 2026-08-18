from django.contrib import admin
from django.utils.html import format_html
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import (
    Advertisement,
    AdvertisementExecution,
    FavoriteAdvertisement,
    SavedSearch,
    DriverAvailability,
    DriverLane,
)


@admin.register(Advertisement, site=admin_site)
class AdvertisementAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = [
        'title_ru', 'client', 'proposed_cost', 'departure_city', 'destination_city',
        'required_body_type', 'is_closed', 'photo_display', 'created_at',
    ]
    list_filter = [
        'is_closed', 'required_body_type', 'requires_adr', 'requires_reefer', 'is_heavy',
        'created_at', 'departure_city', 'destination_city',
    ]
    search_fields = [
        'title_ru', 'title_en', 'title_uz',
        'client__phone', 'client__first_name', 'client__last_name',
    ]
    readonly_fields = ['created_at', 'updated_at', 'photo_display']
    list_editable = ['is_closed']

    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': (
                'client', 'title_ru', 'title_en', 'title_uz',
                'description_ru', 'description_en', 'description_uz',
            )
        }),
        ('Narx va o\'lchamlar', {
            'fields': ('proposed_cost', 'weight', 'currency', 'cargo_category', 'volume_m3')
        }),
        ('Matching talablari', {
            'fields': (
                'required_body_type', 'requires_adr', 'requires_reefer',
                'is_heavy', 'special_requirements',
            )
        }),
        ('Manzillar', {
            'fields': (
                'departure_city', 'departure_address',
                'destination_city', 'destination_address',
            )
        }),
        ('Boshqa', {
            'fields': ('photo', 'photo_display', 'is_closed')
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    def photo_display(self, obj):
        if obj.photo:
            return format_html(
                '<img src="{}" style="max-width: 100px; max-height: 100px;" />',
                obj.photo.url,
            )
        return format_html('<span style="color: #999;">Rasm yo\'q</span>')
    photo_display.short_description = 'Rasm'


@admin.register(AdvertisementExecution, site=admin_site)
class AdvertisementExecutionAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['advertisement', 'driver', 'proposed_cost', 'created_at']
    list_filter = ['created_at']
    search_fields = [
        'advertisement__title_ru', 'advertisement__title_en',
        'advertisement__title_uz', 'driver__phone',
    ]
    readonly_fields = ['created_at']


@admin.register(FavoriteAdvertisement, site=admin_site)
class FavoriteAdvertisementAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['user', 'advertisement', 'created_at']
    list_filter = ['created_at']
    search_fields = [
        'user__phone', 'advertisement__title_ru',
        'advertisement__title_en', 'advertisement__title_uz',
    ]
    readonly_fields = ['created_at']


@admin.register(SavedSearch, site=admin_site)
class SavedSearchAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['user', 'name', 'departure_city', 'destination_city', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['user__phone', 'name', 'query']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(DriverAvailability, site=admin_site)
class DriverAvailabilityAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['user', 'status', 'available_from', 'current_city', 'updated_at']
    list_filter = ['status', 'updated_at']
    search_fields = ['user__phone', 'note']
    readonly_fields = ['updated_at']


@admin.register(DriverLane, site=admin_site)
class DriverLaneAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = [
        'user', 'departure_city', 'destination_city',
        'time_from_hour', 'time_to_hour',
        'include_backhaul', 'is_active', 'updated_at',
    ]
    list_filter = ['is_active', 'include_backhaul', 'updated_at']
    search_fields = ['user__phone']
    readonly_fields = ['created_at', 'updated_at']
