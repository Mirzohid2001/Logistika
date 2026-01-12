from django.contrib import admin
from django.core.exceptions import PermissionDenied


class OperatorMixin:
    def _is_operator_only(self, request):
        return request.user.is_operator and not request.user.is_admin and not request.user.is_superuser

    def has_module_permission(self, request):
        if self._is_operator_only(request):
            allowed_models = ['users', 'orders']
            model_app = self.model._meta.app_label
            return model_app in allowed_models
        return super().has_module_permission(request)

    def has_view_permission(self, request, obj=None):
        if self._is_operator_only(request):
            allowed_models = ['users', 'orders']
            model_app = self.model._meta.app_label
            return model_app in allowed_models
        return super().has_view_permission(request, obj)

    def has_add_permission(self, request):
        if self._is_operator_only(request):
            return False
        return super().has_add_permission(request)

    def has_change_permission(self, request, obj=None):
        if self._is_operator_only(request):
            allowed_models = ['users', 'orders']
            model_app = self.model._meta.app_label
            return model_app in allowed_models
        return super().has_change_permission(request, obj)

    def has_delete_permission(self, request, obj=None):
        if self._is_operator_only(request):
            return False
        return super().has_delete_permission(request, obj)


class OperatorUserMixin(OperatorMixin):
    def get_fieldsets(self, request, obj=None):
        fieldsets = super().get_fieldsets(request, obj)
        if self._is_operator_only(request):
            from django.utils.translation import gettext_lazy as _
            restricted_fieldsets = [
                (None, {'fields': ('phone',)}),
                (_('Personal info'), {'fields': ('first_name', 'last_name', 'email', 'avatar', 'document_photos')}),
                (_('Permissions'), {'fields': ('is_verified',)}),
                (_('Important dates'), {'fields': ('created_at', 'updated_at', 'last_login', 'date_joined')}),
            ]
            return restricted_fieldsets
        return fieldsets

    def get_readonly_fields(self, request, obj=None):
        readonly_fields = list(super().get_readonly_fields(request, obj))
        if self._is_operator_only(request):
            return [f for f in readonly_fields if f != 'is_verified'] + [
                'phone', 'is_staff', 'is_superuser', 'is_driver', 'is_operator', 'is_admin', 
                'is_blocked', 'is_active', 'groups', 'user_permissions', 'password', 'last_login', 
                'date_joined', 'created_at', 'updated_at'
            ]
        return readonly_fields


class OperatorOrderMixin(OperatorMixin):
    def has_change_permission(self, request, obj=None):
        if self._is_operator_only(request):
            return True
        return super().has_change_permission(request, obj)

