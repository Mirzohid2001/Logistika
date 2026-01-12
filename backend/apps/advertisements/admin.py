from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import Advertisement, AdvertisementExecution


@admin.register(Advertisement)
class AdvertisementAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['title_ru', 'client', 'proposed_cost', 'departure_country', 'destination_country', 'is_closed', 'created_at']
    list_filter = ['is_closed', 'created_at', 'departure_country', 'destination_country']
    search_fields = ['title_ru', 'title_en', 'title_uz', 'client__phone', 'client_phone']
    readonly_fields = ['created_at', 'updated_at']


@admin.register(AdvertisementExecution)
class AdvertisementExecutionAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['advertisement', 'driver', 'client', 'is_rejected_by_driver', 'created_at']
    list_filter = ['is_rejected_by_driver', 'created_at']
    search_fields = ['advertisement__title_ru', 'advertisement__title_en', 'advertisement__title_uz', 'driver__phone', 'client__phone']
