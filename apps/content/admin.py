from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import StaticContent


@admin.register(StaticContent)
class StaticContentAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['content_type', 'updated_at']
    search_fields = ['content_type']
    readonly_fields = ['updated_at']
