from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import News


@admin.register(News)
class NewsAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['title_ru', 'date', 'created_at']
    list_filter = ['date', 'created_at']
    search_fields = ['title_ru', 'title_en', 'title_uz']
    readonly_fields = ['created_at', 'updated_at']
