from django.contrib import admin

from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site

from .models import MarketplaceTrialAccount, SubscriptionPlan, TrialDeviceGrant, UserSubscription


@admin.register(SubscriptionPlan, site=admin_site)
class SubscriptionPlanAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = (
        'code',
        'audience',
        'price',
        'intro_price_display',
        'first_period_discount_percent',
        'currency',
        'duration_days',
        'is_active',
        'sort_order',
    )
    list_editable = ('price', 'first_period_discount_percent', 'is_active', 'sort_order')
    list_filter = ('audience', 'is_active')
    search_fields = ('code', 'name_ru', 'name_uz', 'name_en')
    ordering = ('sort_order', 'audience', 'code')

    fieldsets = (
        ('Asosiy', {'fields': ('code', 'audience', 'is_active', 'sort_order', 'duration_days', 'currency')}),
        (
            'Narxlar (admin boshqaruvi)',
            {
                'fields': ('price', 'first_period_discount_percent'),
                'description': (
                    'To\'liq narx — keyingi oylar uchun. '
                    'Birinchi obuna chegirmasi — faqat birinchi marta obuna sotib olganda (mijoz va haydovchi).'
                ),
            },
        ),
        (
            'Nomlar',
            {
                'fields': (
                    ('name_uz', 'name_ru', 'name_en'),
                    'description_uz',
                    'description_ru',
                    'description_en',
                ),
            },
        ),
    )

    @admin.display(description='Birinchi oy narxi')
    def intro_price_display(self, obj):
        return f'{obj.intro_price():,.0f} {obj.currency}'


@admin.register(UserSubscription, site=admin_site)
class UserSubscriptionAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = (
        'user',
        'plan',
        'status',
        'is_intro_purchase',
        'list_price',
        'charged_amount',
        'started_at',
        'expires_at',
    )
    list_filter = ('status', 'is_intro_purchase', 'plan__audience')
    search_fields = ('user__phone', 'plan__code')
    raw_id_fields = ('user', 'plan', 'payment')
    readonly_fields = ('created_at', 'updated_at')


@admin.register(MarketplaceTrialAccount, site=admin_site)
class MarketplaceTrialAccountAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ('user', 'free_uses_granted', 'free_uses_consumed', 'uses_remaining_display', 'trial_disabled', 'disabled_reason', 'updated_at')
    list_filter = ('trial_disabled', 'disabled_reason')
    search_fields = ('user__phone', 'user__first_name', 'user__last_name')
    raw_id_fields = ('user',)
    readonly_fields = ('created_at', 'updated_at')

    @admin.display(description='Qolgan')
    def uses_remaining_display(self, obj):
        return obj.uses_remaining


@admin.register(TrialDeviceGrant, site=admin_site)
class TrialDeviceGrantAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ('device_id', 'granted_user', 'created_at')
    search_fields = ('device_id', 'granted_user__phone')
    raw_id_fields = ('granted_user',)
    readonly_fields = ('created_at',)
