from django.contrib import admin
from .models import Notification, NotificationPreference, PushDeliveryQueue, UserNotificationSettings


@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'notification_type', 'title', 'is_read', 'created_at']
    list_filter = ['notification_type', 'is_read', 'created_at']
    search_fields = ['user__phone', 'title', 'message']
    readonly_fields = ['created_at']
    date_hierarchy = 'created_at'


@admin.register(UserNotificationSettings)
class UserNotificationSettingsAdmin(admin.ModelAdmin):
    list_display = ['user', 'push_enabled', 'in_app_enabled', 'updated_at']
    search_fields = ['user__phone']


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ['user', 'notification_type', 'push_enabled', 'in_app_enabled', 'updated_at']
    list_filter = ['notification_type', 'push_enabled', 'in_app_enabled']
    search_fields = ['user__phone']


@admin.register(PushDeliveryQueue)
class PushDeliveryQueueAdmin(admin.ModelAdmin):
    list_display = ['id', 'user', 'status', 'attempts', 'next_retry_at', 'created_at']
    list_filter = ['status', 'created_at']
    search_fields = ['user__phone', 'title']
    readonly_fields = ['created_at', 'updated_at', 'sent_at']
