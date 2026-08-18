from rest_framework import serializers
from .models import Advertisement, AdvertisementExecution, FavoriteAdvertisement, SavedSearch
from apps.locations.serializers import CountrySerializer, CitySerializer
from apps.common.services import get_language_from_request
from apps.users.serializers import UserReputationSerializer


class AdvertisementListSerializer(serializers.ModelSerializer):
    departure_country = serializers.SerializerMethodField()
    departure_city = CitySerializer(read_only=True)
    destination_country = serializers.SerializerMethodField()
    destination_city = CitySerializer(read_only=True)
    title = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    is_fragile = serializers.SerializerMethodField()
    client_user = UserReputationSerializer(source='client', read_only=True)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)
    
    def get_departure_country(self, obj):
        if obj.departure_city and obj.departure_city.country:
            return CountrySerializer(obj.departure_city.country, context=self.context).data
        return None
    
    def get_destination_country(self, obj):
        if obj.destination_city and obj.destination_city.country:
            return CountrySerializer(obj.destination_city.country, context=self.context).data
        return None
    
    def get_is_favorite(self, obj):
        request = self.context.get('request')
        if request and request.user.is_authenticated:
            return FavoriteAdvertisement.objects.filter(user=request.user, advertisement=obj).exists()
        return False

    def get_is_fragile(self, obj):
        return obj.cargo_category == 'fragile'

    class Meta:
        model = Advertisement
        fields = [
            'id', 'photo', 'title', 'proposed_cost', 'weight', 'cargo_category', 'is_fragile',
            'required_body_type', 'requires_adr', 'requires_reefer', 'is_heavy',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'departure_country', 'departure_city', 'destination_country', 'destination_city',
            'is_closed', 'is_favorite', 'client_user', 'created_at',
        ]


class AdvertisementDetailSerializer(serializers.ModelSerializer):
    departure_country = serializers.SerializerMethodField()
    departure_city = CitySerializer(read_only=True)
    destination_country = serializers.SerializerMethodField()
    destination_city = CitySerializer(read_only=True)
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    is_fragile = serializers.SerializerMethodField()
    client_user = UserReputationSerializer(source='client', read_only=True)
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)

    def get_description(self, obj):
        return getattr(obj, f'description_{self.lang}', obj.description_ru)

    def get_is_fragile(self, obj):
        return obj.cargo_category == 'fragile'
    
    def get_departure_country(self, obj):
        if obj.departure_city and obj.departure_city.country:
            return CountrySerializer(obj.departure_city.country, context=self.context).data
        return None
    
    def get_destination_country(self, obj):
        if obj.destination_city and obj.destination_city.country:
            return CountrySerializer(obj.destination_city.country, context=self.context).data
        return None

    class Meta:
        model = Advertisement
        fields = [
            'id', 'client', 'photo', 'title', 'description', 'proposed_cost', 'weight',
            'cargo_category', 'is_fragile', 'volume_m3', 'units_count',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'contact_name', 'contact_phone', 'receiver_name', 'receiver_phone',
            'special_requirements', 'required_body_type', 'requires_adr', 'requires_reefer', 'is_heavy',
            'route_preference', 'route_stops',
            'departure_address', 'departure_country', 'departure_city',
            'destination_address', 'destination_country', 'destination_city',
            'is_closed', 'client_user', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'client', 'created_at', 'updated_at']


class AdvertisementCreateSerializer(serializers.ModelSerializer):
    route_stops = serializers.ListField(child=serializers.DictField(), required=False, allow_empty=True)

    def validate_route_stops(self, value):
        if not value:
            return []
        if len(value) < 2:
            raise serializers.ValidationError('Marshrutda kamida 2 ta nuqta bo\'lishi kerak')
        if len(value) > 20:
            raise serializers.ValidationError('Marshrutda 20 tadan ortiq nuqta bo\'lmasligi kerak')
        normalized = []
        for index, stop in enumerate(value, start=1):
            address = str(stop.get('address') or '').strip()
            if not address:
                raise serializers.ValidationError(f'{index}-nuqta manzili majburiy')
            stop_type = stop.get('stop_type') or ('pickup' if index == 1 else 'delivery')
            if stop_type not in ('pickup', 'delivery'):
                raise serializers.ValidationError(f'{index}-nuqta turi noto\'g\'ri')
            normalized.append({
                'sequence': int(stop.get('sequence') or index),
                'stop_type': stop_type,
                'label': str(stop.get('label') or f'Stop {index}'),
                'address': address,
                'lat': stop.get('lat'),
                'lng': stop.get('lng'),
            })
        normalized.sort(key=lambda item: item['sequence'])
        if normalized[0]['stop_type'] != 'pickup':
            normalized[0]['stop_type'] = 'pickup'
        if normalized[-1]['stop_type'] != 'delivery':
            normalized[-1]['stop_type'] = 'delivery'
        return normalized

    class Meta:
        model = Advertisement
        fields = [
            'photo', 'title_ru', 'title_en', 'title_uz',
            'description_ru', 'description_en', 'description_uz',
            'proposed_cost', 'weight', 'cargo_category', 'volume_m3', 'units_count',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'contact_name', 'contact_phone', 'receiver_name', 'receiver_phone',
            'special_requirements', 'required_body_type', 'requires_adr', 'requires_reefer', 'is_heavy',
            'route_preference', 'route_stops',
            'departure_address', 'departure_city', 'destination_address', 'destination_city'
        ]

    def validate(self, attrs):
        reqs = list(attrs.get('special_requirements') or getattr(self.instance, 'special_requirements', None) or [])
        if attrs.get('requires_reefer') or 'refrigerated' in reqs:
            attrs['requires_reefer'] = True
            if 'refrigerated' not in reqs:
                reqs.append('refrigerated')
        if attrs.get('requires_adr') or 'dangerous' in reqs:
            attrs['requires_adr'] = True
            if 'dangerous' not in reqs:
                reqs.append('dangerous')
        attrs['special_requirements'] = reqs
        return attrs


class FavoriteAdvertisementSerializer(serializers.ModelSerializer):
    advertisement = serializers.SerializerMethodField()
    
    class Meta:
        model = FavoriteAdvertisement
        fields = ['id', 'advertisement', 'created_at']
        read_only_fields = ['id', 'created_at']
    
    def get_advertisement(self, obj):
        serializer = AdvertisementListSerializer(obj.advertisement, context=self.context)
        return serializer.data


class SavedSearchSerializer(serializers.ModelSerializer):
    departure_city = CitySerializer(read_only=True)
    destination_city = CitySerializer(read_only=True)
    
    class Meta:
        model = SavedSearch
        fields = ['id', 'name', 'query', 'departure_city', 'destination_city', 'min_weight', 'max_weight', 'min_cost', 'max_cost', 'filters', 'alerts_enabled', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SavedSearchCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = ['name', 'query', 'departure_city', 'destination_city', 'min_weight', 'max_weight', 'min_cost', 'max_cost', 'filters', 'alerts_enabled']

