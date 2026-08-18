from django.db import models
from apps.users.models import User
from apps.locations.models import City


class Advertisement(models.Model):
    CARGO_CATEGORY_CHOICES = [
        ('general', 'General'),
        ('furniture', 'Furniture'),
        ('food', 'Food'),
        ('electronics', 'Electronics'),
        ('construction', 'Construction'),
        ('documents', 'Documents'),
        ('fragile', 'Fragile'),
        ('other', 'Other'),
    ]
    ROUTE_PREFERENCE_CHOICES = [
        ('fastest', 'Fastest'),
        ('cheapest', 'Cheapest'),
        ('balanced', 'Balanced'),
        ('no_toll', 'No Toll'),
    ]

    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='advertisements')
    title_ru = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200)
    title_uz = models.CharField(max_length=200)
    description_ru = models.TextField(blank=True)
    description_en = models.TextField(blank=True)
    description_uz = models.TextField(blank=True)
    weight = models.DecimalField(max_digits=10, decimal_places=2)
    departure_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name='departure_advertisements')
    departure_address = models.CharField(max_length=500)
    destination_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name='destination_advertisements')
    destination_address = models.CharField(max_length=500)
    cargo_category = models.CharField(max_length=30, choices=CARGO_CATEGORY_CHOICES, default='general')
    volume_m3 = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    units_count = models.PositiveIntegerField(null=True, blank=True)
    pickup_window_start = models.DateTimeField(null=True, blank=True)
    pickup_window_end = models.DateTimeField(null=True, blank=True)
    delivery_deadline = models.DateTimeField(null=True, blank=True)
    contact_name = models.CharField(max_length=255, blank=True, default='')
    contact_phone = models.CharField(max_length=30, blank=True, default='')
    receiver_name = models.CharField(max_length=255, blank=True, default='')
    receiver_phone = models.CharField(max_length=30, blank=True, default='')
    special_requirements = models.JSONField(default=list, blank=True)
    required_body_type = models.CharField(max_length=20, blank=True, default='')
    requires_adr = models.BooleanField(default=False)
    requires_reefer = models.BooleanField(default=False)
    is_heavy = models.BooleanField(default=False)
    route_preference = models.CharField(max_length=20, choices=ROUTE_PREFERENCE_CHOICES, default='balanced')
    route_stops = models.JSONField(default=list, blank=True)
    proposed_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    currency = models.CharField(max_length=3, default='UZS')
    photo = models.ImageField(upload_to='advertisements/', null=True, blank=True)
    is_closed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'advertisements'
        verbose_name = 'Advertisement'
        verbose_name_plural = 'Advertisements'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'is_closed', 'created_at']),
            models.Index(fields=['departure_city', 'destination_city', 'is_closed']),
            models.Index(fields=['is_closed', 'created_at']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return self.title_ru


class AdvertisementExecution(models.Model):
    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='executions')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='advertisement_executions')
    proposed_cost = models.DecimalField(max_digits=12, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'advertisement_executions'
        verbose_name = 'Advertisement Execution'
        verbose_name_plural = 'Advertisement Executions'
        unique_together = ['advertisement', 'driver']

    def __str__(self):
        return f"{self.advertisement.title_ru} - {self.driver.phone}"


class FavoriteAdvertisement(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='favorite_advertisements')
    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='favorited_by')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'favorite_advertisements'
        verbose_name = 'Favorite Advertisement'
        verbose_name_plural = 'Favorite Advertisements'
        unique_together = ['user', 'advertisement']
        ordering = ['-created_at']

    def __str__(self):
        return f"{self.user.phone} - {self.advertisement.title_ru}"


class SavedSearch(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='saved_searches')
    name = models.CharField(max_length=200)
    query = models.CharField(max_length=500, blank=True)
    departure_city = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, blank=True, related_name='saved_searches_departure')
    destination_city = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, blank=True, related_name='saved_searches_destination')
    min_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    max_weight = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    min_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    max_cost = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    filters = models.JSONField(default=dict, blank=True)
    alerts_enabled = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'saved_searches'
        verbose_name = 'Saved Search'
        verbose_name_plural = 'Saved Searches'
        ordering = ['-updated_at']

    def __str__(self):
        return f"{self.user.phone} - {self.name}"


class DriverAvailability(models.Model):
    STATUS_AVAILABLE = 'available'
    STATUS_BUSY = 'busy'
    STATUS_SCHEDULED = 'scheduled'
    STATUS_CHOICES = [
        (STATUS_AVAILABLE, 'Available'),
        (STATUS_BUSY, 'Busy'),
        (STATUS_SCHEDULED, 'Scheduled'),
    ]

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='driver_availability')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_AVAILABLE)
    available_from = models.DateTimeField(null=True, blank=True)
    current_city = models.ForeignKey(City, on_delete=models.SET_NULL, null=True, blank=True, related_name='driver_availability')
    note = models.CharField(max_length=255, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_availability'

    def __str__(self):
        return f"{self.user.phone} {self.status}"


class DriverLane(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_lanes')
    departure_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name='driver_lanes_departure')
    destination_city = models.ForeignKey(City, on_delete=models.PROTECT, related_name='driver_lanes_destination')
    weekdays = models.JSONField(default=list, blank=True)
    # Local pickup hour window (0–23). Null = any time.
    time_from_hour = models.PositiveSmallIntegerField(null=True, blank=True)
    time_to_hour = models.PositiveSmallIntegerField(null=True, blank=True)
    include_backhaul = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'driver_lanes'
        ordering = ['-updated_at']
        indexes = [
            models.Index(fields=['user', 'is_active']),
        ]

    def __str__(self):
        return f"{self.user.phone} {self.departure_city_id}->{self.destination_city_id}"
