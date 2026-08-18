from rest_framework import serializers

from apps.common.services import get_language_from_request
from .models import SubscriptionPlan, UserSubscription
from .services import calculate_plan_pricing


class SubscriptionPlanSerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    regular_price = serializers.SerializerMethodField()
    your_price = serializers.SerializerMethodField()
    intro_eligible = serializers.SerializerMethodField()
    discount_percent = serializers.SerializerMethodField()
    is_intro_purchase = serializers.SerializerMethodField()

    class Meta:
        model = SubscriptionPlan
        fields = [
            'id',
            'code',
            'audience',
            'name',
            'description',
            'price',
            'regular_price',
            'your_price',
            'intro_eligible',
            'discount_percent',
            'is_intro_purchase',
            'currency',
            'duration_days',
        ]

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        request = self.context.get('request')
        if request:
            self.lang = get_language_from_request(request)

    def get_name(self, obj):
        return getattr(obj, f'name_{self.lang}', obj.name_ru)

    def get_description(self, obj):
        return getattr(obj, f'description_{self.lang}', obj.description_ru)

    def _pricing(self, obj):
        cache = getattr(self, '_pricing_cache', None)
        if cache is None:
            cache = {}
            self._pricing_cache = cache
        if obj.pk not in cache:
            request = self.context.get('request')
            user = getattr(request, 'user', None) if request else None
            cache[obj.pk] = calculate_plan_pricing(obj, user) if user and user.is_authenticated else {
                'list_price': obj.price,
                'charge_amount': obj.intro_price(),
                'intro_eligible': True,
                'is_intro_purchase': True,
                'discount_percent': obj.first_period_discount_percent,
                'regular_price': obj.price,
            }
        return cache[obj.pk]

    def get_regular_price(self, obj):
        return self._pricing(obj)['regular_price']

    def get_your_price(self, obj):
        return self._pricing(obj)['charge_amount']

    def get_intro_eligible(self, obj):
        return self._pricing(obj)['intro_eligible']

    def get_discount_percent(self, obj):
        return self._pricing(obj)['discount_percent']

    def get_is_intro_purchase(self, obj):
        return self._pricing(obj)['is_intro_purchase']


class UserSubscriptionSerializer(serializers.ModelSerializer):
    plan = SubscriptionPlanSerializer(read_only=True)

    class Meta:
        model = UserSubscription
        fields = ['id', 'plan', 'status', 'started_at', 'expires_at', 'created_at']


class SubscribeSerializer(serializers.Serializer):
    plan_id = serializers.IntegerField()
    payment_method = serializers.ChoiceField(choices=['mock', 'click', 'payme', 'uzum'], default='mock')
