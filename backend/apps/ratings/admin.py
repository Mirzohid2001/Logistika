from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Rating, Complaint


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


@admin.register(Complaint, site=admin_site)
class ComplaintAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['id', 'order', 'from_user', 'to_user', 'category', 'status', 'created_at']
    list_filter = ['status', 'category', 'created_at']
    search_fields = ['from_user__phone', 'to_user__phone', 'order__id', 'description']
    readonly_fields = ['created_at', 'updated_at']
    list_editable = ['status']
    actions = ['mark_in_review', 'mark_resolved', 'mark_dismissed']

    fieldsets = (
        ('Jaloba', {
            'fields': ('order', 'from_user', 'to_user', 'category', 'description', 'status', 'admin_notes')
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )

    @admin.action(description='Ko\'rib chiqilmoqda')
    def mark_in_review(self, request, queryset):
        queryset.update(status='in_review')

    @admin.action(description='Hal qilindi')
    def mark_resolved(self, request, queryset):
        queryset.update(status='resolved')

    @admin.action(description='Rad etildi')
    def mark_dismissed(self, request, queryset):
        queryset.update(status='dismissed')
