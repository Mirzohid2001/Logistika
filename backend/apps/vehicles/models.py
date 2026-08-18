from django.db import models
from apps.users.models import User


class Vehicle(models.Model):
    BODY_TENT = 'tent'
    BODY_REEFER = 'reefer'
    BODY_TANKER = 'tanker'
    BODY_OPEN = 'open'
    BODY_VAN = 'van'
    BODY_OTHER = 'other'
    BODY_TYPE_CHOICES = [
        (BODY_TENT, 'Tent'),
        (BODY_REEFER, 'Reefer'),
        (BODY_TANKER, 'Tanker'),
        (BODY_OPEN, 'Open'),
        (BODY_VAN, 'Van'),
        (BODY_OTHER, 'Other'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vehicles')
    model = models.CharField(max_length=100)
    make = models.CharField(max_length=100)
    number = models.CharField(max_length=20, unique=True)
    document_photos = models.JSONField(default=list, blank=True)
    photo = models.ImageField(upload_to='vehicles/', null=True, blank=True)
    cargo_volume = models.DecimalField(max_digits=10, decimal_places=2)
    load_capacity = models.DecimalField(max_digits=10, decimal_places=2)
    body_type = models.CharField(max_length=20, choices=BODY_TYPE_CHOICES, default=BODY_OTHER)
    has_adr = models.BooleanField(default=False)
    is_reefer = models.BooleanField(default=False)
    is_heavy_haul = models.BooleanField(default=False)
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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vehicles'
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.make} {self.model} ({self.number})"
