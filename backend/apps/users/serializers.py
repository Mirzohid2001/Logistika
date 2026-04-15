from rest_framework import serializers
from django.db.models import Avg, Count
from .models import User, DriverDocument


class UserSerializer(serializers.ModelSerializer):
    is_client = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    total_ratings = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = ['id', 'phone', 'first_name', 'last_name', 'email', 'avatar', 'is_driver', 'is_client', 'is_operator', 'is_admin', 'is_dispatcher', 'is_updater', 'is_verified', 'average_rating', 'total_ratings', 'created_at']
        read_only_fields = ['id', 'is_verified', 'created_at', 'is_client', 'average_rating', 'total_ratings']
    
    def get_is_client(self, obj):
        return not obj.is_driver
    
    def get_average_rating(self, obj):
        from apps.ratings.models import Rating
        result = Rating.objects.filter(to_user=obj).aggregate(avg=Avg('rating'))
        return round(result['avg'] or 0, 2)
    
    def get_total_ratings(self, obj):
        from apps.ratings.models import Rating
        return Rating.objects.filter(to_user=obj).count()


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)

    class Meta:
        model = User
        fields = ['phone', 'first_name', 'last_name', 'email', 'password', 'password_confirm', 'is_driver']

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Passwords don't match"})
        return attrs

    def create(self, validated_data):
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        return user


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    def validate_avatar(self, value):
        max_size = 5 * 1024 * 1024  # 5MB
        if value and value.size > max_size:
            raise serializers.ValidationError("Avatar hajmi 5MB dan oshmasligi kerak.")

        content_type = (getattr(value, 'content_type', '') or '').lower()
        allowed_types = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp'}
        if content_type and content_type not in allowed_types:
            raise serializers.ValidationError("Faqat JPG, PNG yoki WEBP formatdagi rasm yuklang.")
        return value

    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email', 'avatar']


class FCMTokenSerializer(serializers.Serializer):
    fcm_token = serializers.CharField(max_length=255, required=True)
    
    def update(self, instance, validated_data):
        instance.fcm_token = validated_data.get('fcm_token', instance.fcm_token)
        instance.save()
        return instance


class DriverDocumentSerializer(serializers.ModelSerializer):
    document_type_name = serializers.CharField(source='get_document_type_display', read_only=True)
    vehicle_number = serializers.CharField(source='vehicle.number', read_only=True)
    driver = UserSerializer(source='user', read_only=True)

    class Meta:
        model = DriverDocument
        fields = [
            'id',
            'user',
            'driver',
            'vehicle',
            'vehicle_number',
            'document_type',
            'document_type_name',
            'document_number',
            'issued_at',
            'expires_at',
            'reminder_sent_at',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'user', 'reminder_sent_at', 'created_at', 'updated_at', 'driver', 'vehicle_number']

