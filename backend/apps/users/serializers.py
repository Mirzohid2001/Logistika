from rest_framework import serializers
from django.db.models import Avg, Count
from .models import User, DriverDocument


class LoginRequestSerializer(serializers.Serializer):
    phone = serializers.CharField()
    password = serializers.CharField(write_only=True)
    device_id = serializers.CharField(required=False, allow_blank=True, max_length=128)


class RefreshTokenRequestSerializer(serializers.Serializer):
    refresh = serializers.CharField(write_only=True)


class UserDocumentUploadSerializer(serializers.Serializer):
    document_photos = serializers.ListField(
        child=serializers.ImageField(),
        allow_empty=False,
        max_length=5,
    )


class UserReputationSerializer(serializers.ModelSerializer):
    average_rating = serializers.SerializerMethodField()
    total_ratings = serializers.SerializerMethodField()
    complaints_received_count = serializers.SerializerMethodField()
    trust_score = serializers.SerializerMethodField()
    trust_tier = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            'id', 'first_name', 'last_name', 'is_verified',
            'average_rating', 'total_ratings', 'complaints_received_count',
            'trust_score', 'trust_tier',
        ]

    def _trust_cache(self) -> dict:
        context_cache = self.context.get('trust_cache')
        if context_cache is not None:
            return context_cache
        cache = getattr(self, '_trust_cache_dict', None)
        if cache is None:
            cache = {}
            self._trust_cache_dict = cache
        return cache

    def get_average_rating(self, obj):
        cached = self.context.get('reputation_cache', {}).get(obj.pk)
        if cached is not None:
            return cached['average_rating']
        from apps.ratings.models import Rating
        result = Rating.objects.filter(to_user=obj).aggregate(avg=Avg('rating'))
        return round(result['avg'] or 0, 2)

    def get_total_ratings(self, obj):
        cached = self.context.get('reputation_cache', {}).get(obj.pk)
        if cached is not None:
            return cached['total_ratings']
        from apps.ratings.models import Rating
        return Rating.objects.filter(to_user=obj).count()

    def get_complaints_received_count(self, obj):
        cached = self.context.get('reputation_cache', {}).get(obj.pk)
        if cached is not None:
            return cached['complaints_received_count']
        from apps.ratings.models import Complaint
        return Complaint.objects.filter(to_user=obj).count()

    def get_trust_score(self, obj):
        from .trust import get_user_trust
        return get_user_trust(obj, self._trust_cache())['trust_score']

    def get_trust_tier(self, obj):
        from .trust import get_user_trust
        return get_user_trust(obj, self._trust_cache())['trust_tier']


class UserSerializer(serializers.ModelSerializer):
    marketplace_role = serializers.SerializerMethodField()
    account = serializers.SerializerMethodField()
    average_rating = serializers.SerializerMethodField()
    total_ratings = serializers.SerializerMethodField()
    complaints_received_count = serializers.SerializerMethodField()
    complaints_pending_count = serializers.SerializerMethodField()
    trust_score = serializers.SerializerMethodField()
    trust_tier = serializers.SerializerMethodField()
    subscription = serializers.SerializerMethodField()
    has_expired_documents = serializers.SerializerMethodField()
    expired_document_count = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'phone', 'first_name', 'last_name', 'email', 'avatar',
            'telegram_id', 'telegram_username', 'telegram_photo_url',
            'is_driver', 'is_client', 'marketplace_role',
            'is_operator', 'is_admin', 'is_dispatcher', 'is_updater',
            'is_verified', 'verification_status', 'average_rating', 'total_ratings',
            'complaints_received_count', 'complaints_pending_count',
            'trust_score', 'trust_tier',
            'company_inn', 'is_blocked', 'suspended_until',
            'has_expired_documents', 'expired_document_count',
            'subscription', 'account', 'created_at',
        ]
        read_only_fields = [
            'id', 'is_verified', 'verification_status', 'created_at', 'is_client', 'is_driver',
            'marketplace_role', 'account', 'average_rating', 'total_ratings',
            'complaints_received_count', 'complaints_pending_count', 'company_inn', 'subscription',
            'trust_score', 'trust_tier', 'is_blocked', 'suspended_until',
            'has_expired_documents', 'expired_document_count',
            'telegram_id', 'telegram_username', 'telegram_photo_url',
        ]
    
    def get_average_rating(self, obj):
        from apps.ratings.models import Rating
        result = Rating.objects.filter(to_user=obj).aggregate(avg=Avg('rating'))
        return round(result['avg'] or 0, 2)
    
    def get_total_ratings(self, obj):
        from apps.ratings.models import Rating
        return Rating.objects.filter(to_user=obj).count()

    def get_complaints_received_count(self, obj):
        from apps.ratings.models import Complaint
        return Complaint.objects.filter(to_user=obj).count()

    def get_complaints_pending_count(self, obj):
        from apps.ratings.models import Complaint
        return Complaint.objects.filter(to_user=obj, status__in=('pending', 'in_review')).count()

    def _trust_cache(self) -> dict:
        cache = getattr(self, '_trust_cache_dict', None)
        if cache is None:
            cache = {}
            self._trust_cache_dict = cache
        return cache

    def get_trust_score(self, obj):
        from .trust import get_user_trust
        return get_user_trust(obj, self._trust_cache())['trust_score']

    def get_trust_tier(self, obj):
        from .trust import get_user_trust
        return get_user_trust(obj, self._trust_cache())['trust_tier']

    def _expired_documents(self, obj):
        cached = getattr(obj, '_expired_active_documents_cache', None)
        if cached is not None:
            return cached
        from .document_expiry import get_expired_active_documents
        docs = list(get_expired_active_documents(obj)) if getattr(obj, 'is_driver', False) else []
        obj._expired_active_documents_cache = docs
        return docs

    def get_has_expired_documents(self, obj):
        return bool(self._expired_documents(obj))

    def get_expired_document_count(self, obj):
        return len(self._expired_documents(obj))

    def get_marketplace_role(self, obj):
        from .roles import get_marketplace_role
        return get_marketplace_role(obj)

    def get_subscription(self, obj):
        from apps.subscriptions.services import get_subscription_status_payload
        request = self.context.get('request')
        lang = 'ru'
        if request:
            from apps.common.services import get_language_from_request
            lang = get_language_from_request(request)
        return get_subscription_status_payload(obj, lang=lang)

    def get_account(self, obj):
        from .roles import get_marketplace_role, is_staff_account, requires_subscription
        from apps.subscriptions.services import user_has_active_subscription, get_subscription_status_payload, subscriptions_enforced

        request = self.context.get('request')
        lang = 'ru'
        if request:
            from apps.common.services import get_language_from_request
            lang = get_language_from_request(request)

        role = get_marketplace_role(obj)
        subscription = get_subscription_status_payload(obj, lang=lang)
        needs_sub = requires_subscription(obj) and subscriptions_enforced()
        from apps.subscriptions.services import user_has_marketplace_access
        from apps.subscriptions.trial import get_trial_status_payload
        from .inn import normalize_company_inn

        sub_active = user_has_active_subscription(obj)
        trial = get_trial_status_payload(obj)
        can_access = is_staff_account(obj) or (not needs_sub) or user_has_marketplace_access(obj)
        company_inn_required = obj.is_client and not normalize_company_inn(obj.company_inn)
        from apps.payments.completion_fees import completion_fee_summary

        service_fee = completion_fee_summary(obj)

        return {
            'role': role,
            'is_staff': is_staff_account(obj),
            'subscription_required': needs_sub,
            'subscription_active': sub_active,
            'can_access_platform': can_access,
            'trial': trial,
            'driver_verification_required': role == 'driver' and obj.verification_status != 'approved',
            'company_inn_required': company_inn_required,
            'service_fee_required': service_fee['required'],
            'marketplace_actions_allowed': service_fee['marketplace_actions_allowed'],
            'service_fee': service_fee,
            'subscription': subscription,
        }


class UserRegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    password_confirm = serializers.CharField(write_only=True)
    sms_code = serializers.CharField(write_only=True, required=False, allow_blank=True)
    device_id = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=128)
    company_inn = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=14)

    class Meta:
        model = User
        fields = [
            'phone', 'first_name', 'last_name', 'email', 'password', 'password_confirm',
            'is_driver', 'sms_code', 'device_id', 'company_inn',
        ]

    def validate_phone(self, value):
        from .phone import is_valid_uz_phone, normalize_phone, phone_lookup_variants

        phone = normalize_phone(value)
        if not is_valid_uz_phone(phone):
            raise serializers.ValidationError('Telefon raqam formati noto\'g\'ri. Masalan: +998901234567')
        if User.objects.filter(phone__in=phone_lookup_variants(value)).exists():
            raise serializers.ValidationError(
                'Bu telefon raqam bilan akkaunt mavjud. Kirish sahifasiga o\'ting.',
                code='phone_already_registered',
            )
        return phone

    def validate(self, attrs):
        from django.conf import settings
        from apps.common.services import is_phone_sms_verified, verify_sms_code
        from .inn import inn_already_registered, normalize_company_inn, validate_company_inn

        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({"password": "Passwords don't match"})

        is_driver = bool(attrs.get('is_driver', False))
        raw_inn = attrs.get('company_inn', '')
        if is_driver:
            attrs['company_inn'] = None
        else:
            if not normalize_company_inn(raw_inn):
                raise serializers.ValidationError({
                    'company_inn': 'Korxona STIR raqamini kiriting',
                })
            try:
                inn = validate_company_inn(raw_inn)
            except ValueError as exc:
                raise serializers.ValidationError({'company_inn': str(exc)}) from exc
            if inn_already_registered(inn):
                raise serializers.ValidationError({
                    'company_inn': 'Bu STIR bilan akkaunt allaqachon mavjud. Mavjud akkauntingizga kiring.',
                    'code': 'inn_already_registered',
                })
            attrs['company_inn'] = inn

        phone = attrs.get('phone', '')
        sms_required = getattr(settings, 'SMS_VERIFICATION_REQUIRED', True)
        if sms_required:
            sms_code = (attrs.get('sms_code') or '').strip()
            if not sms_code:
                raise serializers.ValidationError({
                    'sms_code': 'Telefon raqamni SMS orqali tasdiqlang',
                })
            if not verify_sms_code(phone, sms_code) and not is_phone_sms_verified(phone):
                raise serializers.ValidationError({'sms_code': 'Noto\'g\'ri yoki muddati o\'tgan kod'})
            attrs['_phone_verified'] = True
        else:
            attrs['_phone_verified'] = True

        from apps.subscriptions.trial import device_id_required_on_register, normalize_device_id

        device_id = normalize_device_id(attrs.get('device_id'))
        if device_id_required_on_register():
            if not device_id:
                raise serializers.ValidationError({
                    'device_id': 'Qurilma identifikatori talab qilinadi. Ilovani yangilang.',
                })
        attrs['device_id'] = device_id

        return attrs

    def create(self, validated_data):
        from .roles import normalize_registration_roles
        from apps.subscriptions.trial import initialize_marketplace_trial

        phone_verified = validated_data.pop('_phone_verified', False)
        sms_code = validated_data.pop('sms_code', None)
        device_id = (validated_data.pop('device_id', None) or '').strip() or None
        validated_data.pop('password_confirm')
        password = validated_data.pop('password')
        is_driver = validated_data.pop('is_driver', False)
        company_inn = validated_data.pop('company_inn', None)
        validated_data.update(normalize_registration_roles(is_driver=is_driver))
        user = User.objects.create(**validated_data, company_inn=company_inn if not is_driver else None)
        user.set_password(password)
        # SMS tasdiqlangan mijozlar uchun; haydovchilar admin verifikatsiyasini kutadi.
        if phone_verified and user.is_client and not user.is_driver:
            user.is_verified = True
        user.save()
        initialize_marketplace_trial(user, device_id=device_id)
        if company_inn and user.is_client:
            from .models import Company, CompanyMember

            company, _ = Company.objects.get_or_create(inn=company_inn)
            CompanyMember.objects.get_or_create(
                company=company,
                user=user,
                defaults={'role': CompanyMember.ROLE_ADMIN},
            )
        return user


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    company_inn = serializers.CharField(required=False, allow_blank=True, max_length=14)

    def validate_company_inn(self, value):
        from .inn import inn_already_registered, normalize_company_inn, validate_company_inn

        user = self.instance
        if not user or not user.is_client:
            if normalize_company_inn(value):
                raise serializers.ValidationError('STIR faqat mijozlar uchun')
            return None
        if not normalize_company_inn(value):
            raise serializers.ValidationError('Korxona STIR raqamini kiriting')
        try:
            inn = validate_company_inn(value)
        except ValueError as exc:
            raise serializers.ValidationError(str(exc)) from exc
        if inn_already_registered(inn, exclude_user_id=user.id):
            raise serializers.ValidationError(
                'Bu STIR bilan akkaunt allaqachon mavjud. Mavjud akkauntingizga kiring.'
            )
        return inn

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
        fields = ['first_name', 'last_name', 'email', 'avatar', 'company_inn']


class FCMTokenSerializer(serializers.Serializer):
    fcm_token = serializers.CharField(max_length=512, required=True)
    device_id = serializers.CharField(max_length=120, required=False, allow_blank=True, default='')
    platform = serializers.CharField(max_length=20, required=False, allow_blank=True, default='')


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
