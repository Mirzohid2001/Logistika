from django.contrib.auth.models import AbstractUser, BaseUserManager
from django.db import models


class UserManager(BaseUserManager):
    def create_user(self, phone, password=None, **extra_fields):
        if not phone:
            raise ValueError('The Phone field must be set')
        user = self.model(phone=phone, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, phone, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_admin', True)
        
        if extra_fields.get('is_staff') is not True:
            raise ValueError('Superuser must have is_staff=True.')
        if extra_fields.get('is_superuser') is not True:
            raise ValueError('Superuser must have is_superuser=True.')
        
        return self.create_user(phone, password, **extra_fields)


class User(AbstractUser):
    username = None
    phone = models.CharField(max_length=20, unique=True)
    company_inn = models.CharField(
        max_length=9,
        null=True,
        blank=True,
        unique=True,
        db_index=True,
        help_text='Korxona STIR (INN) — faqat mijozlar uchun',
    )
    avatar = models.ImageField(upload_to='avatars/', null=True, blank=True)
    document_photos = models.JSONField(default=list, blank=True)
    is_driver = models.BooleanField(default=False)
    is_client = models.BooleanField(default=True)
    is_operator = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)
    is_dispatcher = models.BooleanField(default=False)
    is_updater = models.BooleanField(default=False)
    is_verified = models.BooleanField(default=False)
    verification_status = models.CharField(
        max_length=20,
        choices=[
            ('not_submitted', 'Not submitted'),
            ('pending', 'Pending review'),
            ('approved', 'Approved'),
            ('rejected', 'Rejected'),
        ],
        default='not_submitted',
    )
    is_blocked = models.BooleanField(default=False)
    suspended_until = models.DateTimeField(null=True, blank=True)
    dispatcher_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    updater_code = models.CharField(max_length=20, unique=True, null=True, blank=True)
    fcm_token = models.CharField(
        max_length=512,
        null=True,
        blank=True,
        help_text='Last-known FCM token (legacy fallback; devices live in DeviceFcmToken)',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()
    
    USERNAME_FIELD = 'phone'
    REQUIRED_FIELDS = ['first_name', 'last_name']

    class Meta:
        db_table = 'users'
        verbose_name = 'User'
        verbose_name_plural = 'Users'
        indexes = [
            models.Index(fields=['phone']),  # Already unique, but explicit index for lookups
            models.Index(fields=['is_driver', 'is_verified']),
            models.Index(fields=['is_driver', 'verification_status']),
            models.Index(fields=['is_blocked']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.first_name} {self.last_name} ({self.phone})"


class DriverDocument(models.Model):
    DOC_TYPE_PASSPORT = 'passport'
    DOC_TYPE_DRIVER_LICENSE = 'driver_license'
    DOC_TYPE_VEHICLE_INSURANCE = 'vehicle_insurance'
    DOC_TYPE_TECH_INSPECTION = 'tech_inspection'
    DOC_TYPE_PERMIT = 'permit'

    DOC_TYPE_CHOICES = [
        (DOC_TYPE_PASSPORT, 'Passport'),
        (DOC_TYPE_DRIVER_LICENSE, 'Driver License'),
        (DOC_TYPE_VEHICLE_INSURANCE, 'Vehicle Insurance'),
        (DOC_TYPE_TECH_INSPECTION, 'Technical Inspection'),
        (DOC_TYPE_PERMIT, 'Permit'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='driver_documents',
        limit_choices_to={'is_driver': True},
    )
    vehicle = models.ForeignKey(
        'vehicles.Vehicle',
        on_delete=models.CASCADE,
        related_name='documents',
        null=True,
        blank=True,
    )
    document_type = models.CharField(max_length=50, choices=DOC_TYPE_CHOICES)
    document_number = models.CharField(max_length=120, blank=True, default='')
    issued_at = models.DateField(null=True, blank=True)
    expires_at = models.DateField()
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_documents'
        verbose_name = 'Driver Document'
        verbose_name_plural = 'Driver Documents'
        ordering = ['expires_at']
        indexes = [
            models.Index(fields=['user', 'document_type']),
            models.Index(fields=['expires_at']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.user.phone} - {self.document_type} ({self.expires_at})"


class Company(models.Model):
    inn = models.CharField(max_length=9, primary_key=True)
    name = models.CharField(max_length=255, blank=True, default='')
    address = models.CharField(max_length=500, blank=True, default='')
    phone = models.CharField(max_length=30, blank=True, default='')
    director_name = models.CharField(max_length=255, blank=True, default='')
    bank_name = models.CharField(max_length=255, blank=True, default='')
    bank_account = models.CharField(max_length=34, blank=True, default='')
    mfo = models.CharField(max_length=5, blank=True, default='')
    oked = models.CharField(max_length=10, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'companies'

    def __str__(self):
        return self.name or self.inn


class CompanyMember(models.Model):
    ROLE_ADMIN = 'admin'
    ROLE_MEMBER = 'member'
    ROLE_CHOICES = [
        (ROLE_ADMIN, 'Admin'),
        (ROLE_MEMBER, 'Member'),
    ]

    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='members')
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='company_memberships')
    role = models.CharField(max_length=20, choices=ROLE_CHOICES, default=ROLE_MEMBER)
    joined_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'company_members'
        unique_together = [['company', 'user']]

    def __str__(self):
        return f"{self.user.phone} @ {self.company.inn}"


class DriverPayoutRequest(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_PAID = 'paid'
    STATUS_REJECTED = 'rejected'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_PAID, 'Paid'),
        (STATUS_REJECTED, 'Rejected'),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='payout_requests',
        limit_choices_to={'is_driver': True},
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    bank_details = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    admin_note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_payout_requests'
        ordering = ['-created_at']

    def __str__(self):
        return f"Payout #{self.id} — {self.user.phone} ({self.amount})"


class DeviceFcmToken(models.Model):
    PLATFORM_IOS = 'ios'
    PLATFORM_ANDROID = 'android'
    PLATFORM_WEB = 'web'
    PLATFORM_UNKNOWN = 'unknown'
    PLATFORM_CHOICES = [
        (PLATFORM_IOS, 'iOS'),
        (PLATFORM_ANDROID, 'Android'),
        (PLATFORM_WEB, 'Web'),
        (PLATFORM_UNKNOWN, 'Unknown'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='device_fcm_tokens')
    token = models.CharField(max_length=512, unique=True)
    device_id = models.CharField(max_length=120, blank=True, default='')
    platform = models.CharField(max_length=20, choices=PLATFORM_CHOICES, default=PLATFORM_UNKNOWN)
    is_active = models.BooleanField(default=True)
    last_seen_at = models.DateTimeField(auto_now=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'device_fcm_tokens'
        indexes = [
            models.Index(fields=['user', 'is_active']),
            models.Index(fields=['device_id']),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=['user', 'device_id'],
                condition=~models.Q(device_id=''),
                name='uniq_active_device_token_per_user',
            ),
        ]

    def __str__(self):
        return f"FCM {self.user_id} {self.platform} {'on' if self.is_active else 'off'}"
