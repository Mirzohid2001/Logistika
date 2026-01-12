from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from apps.common.admin_mixins import OperatorUserMixin
from .models import User


@admin.register(User)
class UserAdmin(OperatorUserMixin, BaseUserAdmin):
    list_display = ['phone', 'first_name', 'last_name', 'email', 'is_driver', 'is_operator', 'is_admin', 'is_verified', 'is_blocked', 'is_staff', 'created_at']
    list_filter = ['is_driver', 'is_operator', 'is_admin', 'is_verified', 'is_blocked', 'is_staff', 'is_superuser']
    search_fields = ['phone', 'first_name', 'last_name', 'email']
    ordering = ['-created_at']
    
    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'email', 'avatar', 'document_photos')}),
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'is_driver', 'is_operator', 'is_admin', 'is_verified', 'is_blocked', 'groups', 'user_permissions'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('phone', 'first_name', 'last_name', 'email', 'password1', 'password2'),
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_login', 'date_joined']

    def has_add_permission(self, request):
        if request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        if request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_delete_permission(request, obj)
