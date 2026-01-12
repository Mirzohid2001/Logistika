from django.db import models
from apps.users.models import User
from apps.locations.models import Country, City


class Advertisement(models.Model):
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='advertisements')
    photo = models.ImageField(upload_to='advertisements/', null=True, blank=True)
    title_ru = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200)
    title_uz = models.CharField(max_length=200)
    description_ru = models.TextField()
    description_en = models.TextField()
    description_uz = models.TextField()
    proposed_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    height = models.DecimalField(max_digits=10, decimal_places=2)
    width = models.DecimalField(max_digits=10, decimal_places=2)
    length = models.DecimalField(max_digits=10, decimal_places=2)
    is_fragile = models.BooleanField(default=False)
    weight = models.DecimalField(max_digits=10, decimal_places=2)
    delivery_time = models.CharField(max_length=100, null=True, blank=True)
    departure_address = models.TextField()
    departure_country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='departure_advertisements')
    departure_city = models.ForeignKey(City, on_delete=models.CASCADE, related_name='departure_advertisements')
    destination_address = models.TextField()
    destination_country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='destination_advertisements')
    destination_city = models.ForeignKey(City, on_delete=models.CASCADE, related_name='destination_advertisements')
    client_phone = models.CharField(max_length=20)
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'advertisements'
        verbose_name = 'Advertisement'
        verbose_name_plural = 'Advertisements'
        ordering = ['-created_at']

    def __str__(self):
        return self.title_ru


class AdvertisementExecution(models.Model):
    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='executions')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_executions')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='client_executions')
    is_rejected_by_driver = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'advertisement_executions'
        verbose_name = 'Advertisement Execution'
        verbose_name_plural = 'Advertisement Executions'
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.advertisement.title_ru} - {self.driver.phone}"
