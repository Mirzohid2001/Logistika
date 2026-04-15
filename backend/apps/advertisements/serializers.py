from rest_framework import serializers
from .models import Advertisement, AdvertisementExecution, FavoriteAdvertisement, SavedSearch
from apps.locations.serializers import CountrySerializer, CitySerializer
from apps.common.services import get_language_from_request


class AdvertisementListSerializer(serializers.ModelSerializer):
    departure_country = serializers.SerializerMethodField()
    departure_city = CitySerializer(read_only=True)
    destination_country = serializers.SerializerMethodField()
    destination_city = CitySerializer(read_only=True)
    title = serializers.SerializerMethodField()
    is_favorite = serializers.SerializerMethodField()
    
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

    class Meta:
        model = Advertisement
        fields = [
            'id', 'photo', 'title', 'proposed_cost', 'weight', 'cargo_category',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'departure_country', 'departure_city', 'destination_country', 'destination_city',
            'is_closed', 'is_favorite', 'created_at'
        ]


class AdvertisementDetailSerializer(serializers.ModelSerializer):
    departure_country = serializers.SerializerMethodField()
    departure_city = CitySerializer(read_only=True)
    destination_country = serializers.SerializerMethodField()
    destination_city = CitySerializer(read_only=True)
    title = serializers.SerializerMethodField()
    description = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)

    def get_description(self, obj):
        return getattr(obj, f'description_{self.lang}', obj.description_ru)
    
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
            'cargo_category', 'volume_m3', 'units_count',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'contact_name', 'contact_phone', 'receiver_name', 'receiver_phone',
            'special_requirements', 'route_preference',
            'departure_address', 'departure_country', 'departure_city',
            'destination_address', 'destination_country', 'destination_city',
            'is_closed', 'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'client', 'created_at', 'updated_at']


class AdvertisementCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Advertisement
        fields = [
            'photo', 'title_ru', 'title_en', 'title_uz',
            'description_ru', 'description_en', 'description_uz',
            'proposed_cost', 'weight', 'cargo_category', 'volume_m3', 'units_count',
            'pickup_window_start', 'pickup_window_end', 'delivery_deadline',
            'contact_name', 'contact_phone', 'receiver_name', 'receiver_phone',
            'special_requirements', 'route_preference',
            'departure_address', 'departure_city', 'destination_address', 'destination_city'
        ]


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
        fields = ['id', 'name', 'query', 'departure_city', 'destination_city', 'min_weight', 'max_weight', 'min_cost', 'max_cost', 'filters', 'created_at', 'updated_at']
        read_only_fields = ['id', 'created_at', 'updated_at']


class SavedSearchCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedSearch
        fields = ['name', 'query', 'departure_city', 'destination_city', 'min_weight', 'max_weight', 'min_cost', 'max_cost', 'filters']

