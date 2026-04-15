from rest_framework import serializers
from .models import Vehicle


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = ['id', 'user', 'model', 'make', 'number', 'photo', 'document_photos', 'cargo_volume', 'load_capacity', 'is_verified', 'created_at', 'updated_at']
        read_only_fields = ['id', 'user', 'is_verified', 'created_at', 'updated_at']


class VehicleCreateSerializer(serializers.ModelSerializer):
    document_photos = serializers.ListField(
        child=serializers.ImageField(required=False),
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = Vehicle
        fields = ['model', 'make', 'number', 'photo', 'cargo_volume', 'load_capacity', 'document_photos']
    
    def create(self, validated_data):
        document_photos = validated_data.pop('document_photos', [])
        vehicle = Vehicle.objects.create(**validated_data)
        
        if document_photos:
            from django.core.files.storage import default_storage
            from django.core.files.base import ContentFile
            import os
            from datetime import datetime
            
            photo_urls = []
            for idx, photo in enumerate(document_photos):
                if hasattr(photo, 'read'):
                    file_name = f'vehicles/documents/{vehicle.id}_{datetime.now().timestamp()}_{idx}_{photo.name}'
                    file_path = default_storage.save(file_name, ContentFile(photo.read()))
                    photo_urls.append(default_storage.url(file_path))
                elif hasattr(photo, 'url'):
                    photo_urls.append(photo.url)
                elif isinstance(photo, str):
                    photo_urls.append(photo)
                else:
                    photo_urls.append(str(photo))
            vehicle.document_photos = photo_urls
            vehicle.save()
        
        return vehicle
    
    def update(self, instance, validated_data):
        document_photos = validated_data.pop('document_photos', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        if document_photos is not None:
            photo_urls = []
            for photo in document_photos:
                if hasattr(photo, 'url'):
                    photo_urls.append(photo.url)
                elif isinstance(photo, str):
                    photo_urls.append(photo)
                else:
                    photo_urls.append(str(photo))
            instance.document_photos = photo_urls
        
        instance.save()
        return instance

