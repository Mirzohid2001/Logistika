from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from .models import Country, City


@admin.register(Country)
class CountryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'name_en', 'name_uz', 'code']
    search_fields = ['name_ru', 'name_en', 'name_uz', 'code']


@admin.register(City)
class CityAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'country', 'name_en', 'name_uz']
    list_filter = ['country']
    search_fields = ['name_ru', 'name_en', 'name_uz']
