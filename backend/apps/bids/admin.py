from django.contrib import admin
from apps.common.admin_mixins import OperatorMixin
from config.admin import admin_site
from .models import Bid


@admin.register(Bid, site=admin_site)
class BidAdmin(OperatorMixin, admin.ModelAdmin):
    list_display = ['advertisement', 'driver', 'client', 'current_amount_display', 'is_accepted_by_client', 'is_rejected_by_client', 'is_rejected_by_driver', 'created_at']
    list_filter = ['is_accepted_by_client', 'is_rejected_by_client', 'is_rejected_by_driver', 'created_at']
    search_fields = ['advertisement__title_ru', 'advertisement__title_en', 'advertisement__title_uz', 'driver__phone', 'client__phone']
    readonly_fields = ['created_at', 'updated_at', 'current_amount_display', 'proposed_amounts_display']
    
    fieldsets = (
        ('Asosiy ma\'lumotlar', {
            'fields': ('advertisement', 'driver', 'client')
        }),
        ('Takliflar', {
            'fields': ('proposed_amounts', 'proposed_amounts_display', 'current_amount_display', 'last_counter_by')
        }),
        ('Holat', {
            'fields': ('is_driver_agreed_to_amount', 'is_accepted_by_client', 'is_rejected_by_client', 'is_rejected_by_driver')
        }),
        ('Vaqt', {
            'fields': ('created_at', 'updated_at')
        }),
    )
    
    def current_amount_display(self, obj):
        amount = obj.get_current_amount()
        if amount:
            return f"{amount} UZS"
        return "Taklif yo'q"
    current_amount_display.short_description = 'Joriy taklif'
    
    def proposed_amounts_display(self, obj):
        if obj.proposed_amounts:
            amounts = []
            for proposal in obj.proposed_amounts:
                if isinstance(proposal, dict):
                    by_value = proposal.get('by', 'Noma\'lum')
                    amounts.append(f"{proposal.get('amount')} UZS ({by_value})")
                else:
                    amounts.append(f"{proposal} UZS")
            return ', '.join(amounts)
        return "Takliflar yo'q"
    proposed_amounts_display.short_description = 'Barcha takliflar'
