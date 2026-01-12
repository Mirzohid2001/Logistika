from django.db import models
from apps.users.models import User


class Vehicle(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='vehicles')
    model = models.CharField(max_length=100)
    make = models.CharField(max_length=100)
    number = models.CharField(max_length=20, unique=True)
    document_photos = models.JSONField(default=list, blank=True)
    photo = models.ImageField(upload_to='vehicles/', null=True, blank=True)
    cargo_volume = models.DecimalField(max_digits=10, decimal_places=2)
    load_capacity = models.DecimalField(max_digits=10, decimal_places=2)
    is_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'vehicles'
        verbose_name = 'Vehicle'
        verbose_name_plural = 'Vehicles'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.make} {self.model} ({self.number})"
