from rest_framework import serializers
from .models import Country, City
from apps.common.services import get_language_from_request


class CountrySerializer(serializers.ModelSerializer):
    name = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_name(self, obj):
        return getattr(obj, f'name_{self.lang}', obj.name_ru)

    class Meta:
        model = Country
        fields = ['id', 'name', 'code']


class CitySerializer(serializers.ModelSerializer):
    country = serializers.SerializerMethodField()
    country_id = serializers.PrimaryKeyRelatedField(queryset=Country.objects.all(), source='country', write_only=True)
    name = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_name(self, obj):
        return getattr(obj, f'name_{self.lang}', obj.name_ru)
    
    def get_country(self, obj):
        if hasattr(obj, 'country'):
            context = getattr(self, '_context', {})
            return CountrySerializer(obj.country, context=context).data
        return None

    class Meta:
        model = City
        fields = ['id', 'country', 'country_id', 'name']

