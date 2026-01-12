from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin, OperatorOrderMixin
from .models import Order, OrderStatus, OrderLocationTrack


@admin.register(OrderStatus)
class OrderStatusAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'name_en', 'name_uz', 'code']
    search_fields = ['name_ru', 'name_en', 'name_uz', 'code']

    def has_change_permission(self, request, obj=None):
        if request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)


@admin.register(Order)
class OrderAdmin(OperatorOrderMixin, admin.ModelAdmin):
    list_display = ['id', 'advertisement', 'driver', 'client', 'status', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['advertisement__title_ru', 'advertisement__title_en', 'advertisement__title_uz', 'driver__phone', 'client__phone']
    readonly_fields = ['created_at', 'updated_at', 'started_at', 'completed_at']

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = list(super().get_readonly_fields(request, obj))
        if request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return readonly_fields + ['advertisement', 'driver', 'client']
        return readonly_fields


@admin.register(OrderLocationTrack)
class OrderLocationTrackAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['order', 'lat', 'lng', 'timestamp']
    list_filter = ['timestamp']
    search_fields = ['order__id']
    readonly_fields = ['timestamp']

    def has_change_permission(self, request, obj=None):
        if request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_change_permission(request, obj)
