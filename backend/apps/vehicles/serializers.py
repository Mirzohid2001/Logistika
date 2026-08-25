from rest_framework import serializers
from django.core.files.storage import default_storage

from .models import Vehicle
from apps.common.file_validation import validate_verification_image


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = [
            'id', 'user', 'model', 'make', 'number', 'photo', 'document_photos',
            'cargo_volume', 'load_capacity', 'body_type', 'has_adr', 'is_reefer',
            'is_heavy_haul', 'is_verified', 'verification_status', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'user', 'is_verified', 'verification_status', 'created_at', 'updated_at']


class VehicleCreateSerializer(serializers.ModelSerializer):
    document_photos = serializers.ListField(
        child=serializers.ImageField(required=False),
        required=False,
        allow_empty=True
    )
    
    class Meta:
        model = Vehicle
        fields = [
            'model', 'make', 'number', 'photo', 'cargo_volume', 'load_capacity',
            'body_type', 'has_adr', 'is_reefer', 'is_heavy_haul', 'document_photos',
        ]

    def validate(self, attrs):
        if attrs.get('body_type') == 'reefer':
            attrs['is_reefer'] = True
        return attrs

    def validate_document_photos(self, value):
        if len(value) > 5:
            raise serializers.ValidationError('Eng ko\'pi 5 ta hujjat rasmi yuborish mumkin')
        for photo in value:
            try:
                validate_verification_image(photo)
            except ValueError as exc:
                raise serializers.ValidationError(str(exc)) from exc
        return value

    @staticmethod
    def _save_document_photos(vehicle, document_photos):
        import uuid

        saved_paths = []
        try:
            for photo in document_photos:
                extension = validate_verification_image(photo)
                file_name = f'vehicles/documents/{vehicle.id}/{uuid.uuid4().hex}.{extension}'
                saved_paths.append(default_storage.save(file_name, photo))
        except Exception:
            for saved_path in saved_paths:
                default_storage.delete(saved_path)
            raise
        return saved_paths
    
    def create(self, validated_data):
        document_photos = validated_data.pop('document_photos', [])
        vehicle = Vehicle.objects.create(**validated_data)
        
        if document_photos:
            try:
                vehicle.document_photos = self._save_document_photos(vehicle, document_photos)
            except Exception:
                vehicle.delete()
                raise

        extra_fields = ['document_photos'] if document_photos else []
        from apps.users.verification import mark_vehicle_verification_pending
        mark_vehicle_verification_pending(vehicle, save_fields=extra_fields)
        return vehicle
    
    def update(self, instance, validated_data):
        document_photos = validated_data.pop('document_photos', None)
        
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        
        if document_photos is not None:
            old_paths = list(instance.document_photos or [])
            new_paths = self._save_document_photos(instance, document_photos)
            instance.document_photos = new_paths
            if new_paths:
                instance.verification_status = 'pending'
                instance.is_verified = False

        instance.save()
        for old_path in old_paths if document_photos is not None else []:
            if isinstance(old_path, str) and old_path.startswith(f'vehicles/documents/{instance.id}/'):
                default_storage.delete(old_path)
        if document_photos is not None and instance.document_photos:
            from apps.users.verification import mark_vehicle_verification_pending
            mark_vehicle_verification_pending(instance)
        return instance
