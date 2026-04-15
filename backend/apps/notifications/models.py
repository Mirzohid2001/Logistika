from django.db import models
from apps.users.models import User
from apps.orders.models import Order


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('order_created', 'Buyurtma yaratildi'),
        ('order_accepted', 'Buyurtma qabul qilindi'),
        ('order_approved', 'Buyurtma tasdiqlandi'),
        ('order_started', 'Buyurtma boshlandi'),
        ('order_completed', 'Buyurtma yakunlandi'),
        ('order_cancelled', 'Buyurtma bekor qilindi'),
        ('payment_received', 'To\'lov qabul qilindi'),
        ('driver_assigned', 'Haydovchi tayinlandi'),
        ('message_received', 'Xabar qabul qilindi'),
        ('rating_received', 'Reyting qoldirildi'),
        ('geofence_event', 'Geofence hodisasi'),
        ('document_expiry', 'Hujjat muddati tugashi'),
        ('system', 'Tizim xabari'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True)
    notification_type = models.CharField(max_length=50, choices=NOTIFICATION_TYPES)
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['user', 'is_read']),
            models.Index(fields=['created_at']),
        ]

    def __str__(self):
        return f"{self.title} - {self.user.phone}"
