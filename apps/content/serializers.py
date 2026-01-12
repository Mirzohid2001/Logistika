from rest_framework import serializers
from .models import StaticContent
from apps.common.services import get_language_from_request


class StaticContentSerializer(serializers.ModelSerializer):
    content = serializers.SerializerMethodField()
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.lang = 'ru'
        if 'context' in kwargs and 'request' in kwargs['context']:
            self.lang = get_language_from_request(kwargs['context']['request'])

    def get_content(self, obj):
        return getattr(obj, f'content_{self.lang}', obj.content_ru)

    class Meta:
        model = StaticContent
        fields = ['id', 'content_type', 'content', 'updated_at']
        read_only_fields = ['updated_at']

