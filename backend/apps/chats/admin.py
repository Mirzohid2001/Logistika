from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Chat, Message


@admin.register(Chat, site=admin_site)
class ChatAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'order', 'client', 'driver', 'messages_count', 'unread_count', 'created_at', 'updated_at']
    list_filter = ['created_at', 'updated_at']
    search_fields = ['order__id', 'client__phone', 'driver__phone', 'client__first_name', 'client__last_name', 'driver__first_name', 'driver__last_name']
    readonly_fields = ['created_at', 'updated_at']
    
    def messages_count(self, obj):
        return obj.messages.count()
    messages_count.short_description = 'Xabarlar soni'
    
    def unread_count(self, obj):
        return obj.messages.filter(is_read=False).count()
    unread_count.short_description = 'O\'qilmagan xabarlar'


@admin.register(Message, site=admin_site)
class MessageAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'chat', 'sender', 'text_preview', 'is_read', 'created_at']
    list_filter = ['is_read', 'created_at']
    search_fields = ['text', 'sender__phone', 'sender__first_name', 'sender__last_name', 'chat__order__id']
    readonly_fields = ['created_at']
    list_editable = ['is_read']
    
    def text_preview(self, obj):
        if len(obj.text) > 50:
            return obj.text[:50] + '...'
        return obj.text
    text_preview.short_description = 'Matn'