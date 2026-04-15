from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Country, City


@admin.register(Country, site=admin_site)
class CountryAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'name_en', 'name_uz', 'code', 'cities_count']
    search_fields = ['name_ru', 'name_en', 'name_uz', 'code']
    
    def cities_count(self, obj):
        return obj.cities.count()
    cities_count.short_description = 'Shaharlar soni'


@admin.register(City, site=admin_site)
class CityAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['name_ru', 'country', 'name_en', 'name_uz']
    list_filter = ['country']
    search_fields = ['name_ru', 'name_en', 'name_uz', 'country__name_ru', 'country__name_en', 'country__name_uz']
