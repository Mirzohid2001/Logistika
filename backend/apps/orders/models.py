import uuid
from django.db import models
from apps.users.models import User
from apps.advertisements.models import Advertisement


class OrderStatus(models.Model):
    name_ru = models.CharField(max_length=50)
    name_en = models.CharField(max_length=50)
    name_uz = models.CharField(max_length=50)
    code = models.CharField(max_length=20, unique=True)

    class Meta:
        db_table = 'order_statuses'
        verbose_name = 'Order Status'
        verbose_name_plural = 'Order Statuses'

    def __str__(self):
        return self.name_ru


class Order(models.Model):
    advertisement = models.ForeignKey(Advertisement, on_delete=models.CASCADE, related_name='orders')
    driver = models.ForeignKey(User, on_delete=models.CASCADE, related_name='driver_orders')
    client = models.ForeignKey(User, on_delete=models.CASCADE, related_name='client_orders')
    status = models.ForeignKey(OrderStatus, on_delete=models.PROTECT, related_name='orders')
    current_location_lat = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    current_location_lng = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    planned_route_points = models.JSONField(default=list, blank=True)
    route_deviation_threshold_meters = models.PositiveIntegerField(default=500)
    route_deviation_last_alert_at = models.DateTimeField(null=True, blank=True)
    route_deviation_last_distance_meters = models.FloatField(null=True, blank=True)
    route_deviation_count = models.PositiveIntegerField(default=0)
    pickup_geofence_radius_meters = models.PositiveIntegerField(default=300)
    destination_geofence_radius_meters = models.PositiveIntegerField(default=300)
    is_in_pickup_geofence = models.BooleanField(default=False)
    is_in_destination_geofence = models.BooleanField(default=False)
    pickup_entered_at = models.DateTimeField(null=True, blank=True)
    pickup_exited_at = models.DateTimeField(null=True, blank=True)
    destination_entered_at = models.DateTimeField(null=True, blank=True)
    eta_share_enabled = models.BooleanField(default=False)
    eta_share_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders'
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['client', 'created_at']),
            models.Index(fields=['driver', 'created_at']),
            models.Index(fields=['status', 'created_at']),
            models.Index(fields=['advertisement']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"Order {self.id} - {self.advertisement.title_ru}"
    
    @property
    def total_amount(self):
        if self.advertisement.proposed_cost:
            return self.advertisement.proposed_cost
        return 0
    
    @property
    def paid_amount(self):
        from apps.payments.models import Payment
        total = Payment.objects.filter(
            order=self,
            payment_status='completed'
        ).exclude(
            refunded_at__isnull=False
        ).aggregate(
            total=models.Sum('amount')
        )['total'] or 0
        return total
    
    @property
    def remaining_amount(self):
        return max(0, self.total_amount - self.paid_amount)
    
    @property
    def is_fully_paid(self):
        return self.remaining_amount <= 0
    
    @property
    def payment_progress(self):
        if self.total_amount == 0:
            return 100
        return min(100, (self.paid_amount / self.total_amount) * 100)


class OrderLocationTrack(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='location_tracks')
    lat = models.DecimalField(max_digits=9, decimal_places=6)
    lng = models.DecimalField(max_digits=9, decimal_places=6)
    timestamp = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'order_location_tracks'
        verbose_name = 'Order Location Track'
        verbose_name_plural = 'Order Location Tracks'
        ordering = ['-timestamp']

    def __str__(self):
        return f"Track for Order {self.order.id} at {self.timestamp}"


class OrderProofOfDelivery(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='proof_of_delivery')
    delivered_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='delivered_orders_pod')
    receiver_name = models.CharField(max_length=255)
    receiver_signature = models.TextField(blank=True, default='')
    delivery_photo = models.ImageField(upload_to='orders/pod/', null=True, blank=True)
    delivered_lat = models.DecimalField(max_digits=9, decimal_places=6)
    delivered_lng = models.DecimalField(max_digits=9, decimal_places=6)
    delivered_at = models.DateTimeField(auto_now_add=True)
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_proof_of_delivery'
        verbose_name = 'Order Proof Of Delivery'
        verbose_name_plural = 'Order Proof Of Deliveries'
        ordering = ['-delivered_at']

    def __str__(self):
        return f"POD for order {self.order_id}"


class OrderReturnQuality(models.Model):
    QUALITY_OK = 'ok'
    QUALITY_OPENED = 'opened'
    QUALITY_DAMAGED = 'damaged'
    QUALITY_CHOICES = [
        (QUALITY_OK, 'OK'),
        (QUALITY_OPENED, 'Opened'),
        (QUALITY_DAMAGED, 'Damaged'),
    ]

    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='return_quality')
    classified_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='classified_returns')
    quality_status = models.CharField(max_length=20, choices=QUALITY_CHOICES)
    photo = models.ImageField(upload_to='orders/returns/', null=True, blank=True)
    note = models.TextField(blank=True, default='')
    classified_at = models.DateTimeField(auto_now_add=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_return_quality'
        verbose_name = 'Order Return Quality'
        verbose_name_plural = 'Order Return Qualities'
        ordering = ['-classified_at']

    def __str__(self):
        return f"Return quality for order {self.order_id}: {self.quality_status}"


class OrderTrackingShareLink(models.Model):
    order = models.OneToOneField(Order, on_delete=models.CASCADE, related_name='tracking_share')
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    created_by = models.ForeignKey(User, on_delete=models.PROTECT, related_name='created_tracking_links')
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField()
    last_accessed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'order_tracking_share_links'
        verbose_name = 'Order Tracking Share Link'
        verbose_name_plural = 'Order Tracking Share Links'
        ordering = ['-created_at']

    def __str__(self):
        return f"Share link for order {self.order_id}"
