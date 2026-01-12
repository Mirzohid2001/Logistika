from rest_framework import serializers
from .models import Advertisement, AdvertisementExecution
from apps.locations.serializers import CountrySerializer, CitySerializer
from apps.common.services import get_language_from_request


class AdvertisementListSerializer(serializers.ModelSerializer):
    departure_country = CountrySerializer(read_only=True)
    departure_city = CitySerializer(read_only=True)
    destination_country = CountrySerializer(read_only=True)
    destination_city = CitySerializer(read_only=True)
    title = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)

    class Meta:
        model = Advertisement
        fields = ['id', 'photo', 'title', 'proposed_cost', 'weight', 'departure_country', 'departure_city', 'destination_country', 'destination_city', 'is_closed', 'created_at']


class AdvertisementDetailSerializer(serializers.ModelSerializer):
    departure_country = CountrySerializer(read_only=True)
    departure_city = CitySerializer(read_only=True)
    destination_country = CountrySerializer(read_only=True)
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

    class Meta:
        model = Advertisement
        fields = ['id', 'client', 'photo', 'title', 'description', 'proposed_cost', 'height', 'width', 'length', 'is_fragile', 'weight', 'delivery_time', 'departure_address', 'departure_country', 'departure_city', 'destination_address', 'destination_country', 'destination_city', 'client_phone', 'is_closed', 'created_at', 'updated_at']
        read_only_fields = ['id', 'client', 'created_at', 'updated_at']


class AdvertisementCreateSerializer(serializers.ModelSerializer):
    class Meta:
        model = Advertisement
        fields = ['photo', 'title_ru', 'title_en', 'title_uz', 'description_ru', 'description_en', 'description_uz', 'proposed_cost', 'height', 'width', 'length', 'is_fragile', 'weight', 'delivery_time', 'departure_address', 'departure_country', 'departure_city', 'destination_address', 'destination_country', 'destination_city', 'client_phone']

