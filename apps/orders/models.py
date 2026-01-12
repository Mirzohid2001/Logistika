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
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'orders'
        verbose_name = 'Order'
        verbose_name_plural = 'Orders'
        ordering = ['-created_at']

    def __str__(self):
        return f"Order {self.id} - {self.advertisement.title_ru}"


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
