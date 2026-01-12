from rest_framework import serializers
from .models import News
from apps.common.services import get_language_from_request


class NewsListSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)

    class Meta:
        model = News
        fields = ['id', 'photo', 'title', 'date', 'created_at']


class NewsDetailSerializer(serializers.ModelSerializer):
    title = serializers.SerializerMethodField()
    text = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_title(self, obj):
        return getattr(obj, f'title_{self.lang}', obj.title_ru)

    def get_text(self, obj):
        return getattr(obj, f'text_{self.lang}', obj.text_ru)

    class Meta:
        model = News
        fields = ['id', 'photo', 'title', 'text', 'date', 'created_at', 'updated_at']

