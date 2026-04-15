from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin, OperatorOrderMixin
from config.admin import admin_site
from .models import (
    Order,
    OrderStatus,
    OrderLocationTrack,
    OrderProofOfDelivery,
    OrderReturnQuality,
    OrderTrackingShareLink,
)


@admin.register(OrderStatus, site=admin_site)
class OrderStatusAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'name_en', 'name_uz', 'code']
    search_fields = ['name_ru', 'name_en', 'name_uz', 'code']

    def has_change_permission(self, request, obj=None):
        if request.user.is_authenticated and request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)


@admin.register(Order, site=admin_site)
class OrderAdmin(OperatorOrderMixin, admin.ModelAdmin):
    list_display = ['id', 'advertisement', 'driver', 'client', 'status', 'route_deviation_count', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['advertisement__title_ru', 'advertisement__title_en', 'advertisement__title_uz', 'driver__phone', 'client__phone']
    readonly_fields = ['created_at', 'updated_at', 'started_at', 'completed_at']

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = list(super().get_readonly_fields(request, obj))
        if request.user.is_authenticated and request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return readonly_fields + ['advertisement', 'driver', 'client']
        return readonly_fields


@admin.register(OrderLocationTrack, site=admin_site)
class OrderLocationTrackAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['order', 'lat', 'lng', 'timestamp']
    list_filter = ['timestamp']
    search_fields = ['order__id']
    readonly_fields = ['timestamp']

    def has_change_permission(self, request, obj=None):
        if request.user.is_authenticated and request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)


@admin.register(OrderProofOfDelivery, site=admin_site)
class OrderProofOfDeliveryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['order', 'delivered_by', 'receiver_name', 'delivered_at']
    list_filter = ['delivered_at']
    search_fields = ['order__id', 'receiver_name', 'delivered_by__phone']
    readonly_fields = ['created_at', 'updated_at', 'delivered_at']


@admin.register(OrderReturnQuality, site=admin_site)
class OrderReturnQualityAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['order', 'quality_status', 'classified_by', 'classified_at']
    list_filter = ['quality_status', 'classified_at']
    search_fields = ['order__id', 'classified_by__phone', 'note']
    readonly_fields = ['created_at', 'updated_at', 'classified_at']


@admin.register(OrderTrackingShareLink, site=admin_site)
class OrderTrackingShareLinkAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['order', 'token', 'is_active', 'expires_at', 'last_accessed_at']
    list_filter = ['is_active', 'expires_at']
    search_fields = ['order__id', 'token', 'created_by__phone']
    readonly_fields = ['token', 'created_at', 'updated_at', 'last_accessed_at']
