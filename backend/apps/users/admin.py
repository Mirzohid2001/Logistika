from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.utils.translation import gettext_lazy as _
from django.utils.html import format_html
from django.urls import path
from django.shortcuts import redirect
from django.contrib import messages
from apps.common.admin_mixins import OperatorUserMixin
from config.admin import admin_site
from .models import User, DriverDocument, DeviceFcmToken, Company


@admin.register(User, site=admin_site)
class UserAdmin(OperatorUserMixin, BaseUserAdmin):
    list_display = ['phone', 'company_inn', 'first_name', 'last_name', 'email', 'is_driver', 'is_client', 'is_operator', 'is_admin', 'is_dispatcher', 'is_updater', 'is_verified', 'is_blocked', 'is_staff', 'created_at']
    list_filter = ['is_driver', 'is_client', 'is_operator', 'is_admin', 'is_dispatcher', 'is_updater', 'is_verified', 'is_blocked', 'is_staff', 'is_superuser']
    search_fields = ['phone', 'company_inn', 'first_name', 'last_name', 'email']
    ordering = ['-created_at']
    
    fieldsets = (
        (None, {'fields': ('phone', 'password')}),
        (_('Personal info'), {'fields': ('first_name', 'last_name', 'email', 'company_inn', 'avatar', 'document_photos')}),
        (_('Permissions'), {
            'fields': ('is_active', 'is_staff', 'is_superuser', 'is_driver', 'is_client', 'is_operator', 'is_admin', 'is_dispatcher', 'is_updater', 'is_verified', 'is_blocked', 'groups', 'user_permissions'),
        }),
        (_('Important dates'), {'fields': ('last_login', 'date_joined', 'created_at', 'updated_at')}),
    )
    
    add_fieldsets = (
        (None, {
            'classes': ('wide',),
            'fields': ('phone', 'first_name', 'last_name', 'email', 'password1', 'password2'),
        }),
    )
    
    readonly_fields = ['created_at', 'updated_at', 'last_login', 'date_joined', 'document_photos_display']
    
    def document_photos_display(self, obj):
        if obj.document_photos and len(obj.document_photos) > 0:
            images_html = ''
            for photo in obj.document_photos:
                images_html += f'<img src="{photo}" style="max-width: 200px; margin: 5px; border: 1px solid #ddd; border-radius: 4px;" />'
            return format_html(images_html)
        return format_html('<span style="color: #999;">Hujjatlar yo\'q</span>')
    document_photos_display.short_description = 'Hujjatlar'

    def get_urls(self):
        urls = super().get_urls()
        custom_urls = [
            path('<int:user_id>/verify/', self.admin_site.admin_view(self.verify_driver), name='users_user_verify'),
        ]
        return custom_urls + urls

    def verify_driver(self, request, user_id):
        if request.method == 'POST':
            try:
                from apps.users.verification import mark_driver_verification_approved
                user = User.objects.get(id=user_id, is_driver=True)
                mark_driver_verification_approved(user)
                messages.success(request, f'Haydovchi {user.first_name} {user.last_name} tasdiqlandi.')
            except User.DoesNotExist:
                messages.error(request, 'Haydovchi topilmadi.')
            except Exception as e:
                messages.error(request, f'Xatolik: {str(e)}')
        return redirect('admin:users_user_changelist')
    

    def has_add_permission(self, request):
        if request.user.is_authenticated and request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_add_permission(request)

    def has_delete_permission(self, request, obj=None):
        if request.user.is_authenticated and request.user.is_operator and not request.user.is_admin and not request.user.is_superuser:
            return False
        return super().has_delete_permission(request, obj)


@admin.register(DriverDocument, site=admin_site)
class DriverDocumentAdmin(admin.ModelAdmin):
    list_display = ['user', 'document_type', 'document_number', 'expires_at', 'is_active', 'reminder_sent_at']
    list_filter = ['document_type', 'is_active', 'expires_at']
    search_fields = ['user__phone', 'document_number']
    readonly_fields = ['created_at', 'updated_at', 'reminder_sent_at']


@admin.register(DeviceFcmToken, site=admin_site)
class DeviceFcmTokenAdmin(admin.ModelAdmin):
    list_display = ['user', 'platform', 'device_id', 'is_active', 'last_seen_at']
    list_filter = ['platform', 'is_active']
    search_fields = ['user__phone', 'device_id', 'token']
    readonly_fields = ['created_at', 'updated_at', 'last_seen_at']


@admin.register(Company, site=admin_site)
class CompanyAdmin(admin.ModelAdmin):
    list_display = ['inn', 'name', 'director_name', 'phone', 'mfo']
    search_fields = ['inn', 'name', 'director_name', 'bank_account']
    readonly_fields = ['created_at', 'updated_at']
