from django.db import models
from apps.users.models import User
from apps.orders.models import Order
from apps.advertisements.models import Advertisement


class Notification(models.Model):
    NOTIFICATION_TYPES = [
        ('order_created', 'Buyurtma yaratildi'),
        ('order_accepted', 'Buyurtma qabul qilindi'),
        ('order_approved', 'Buyurtma tasdiqlandi'),
        ('order_started', 'Buyurtma boshlandi'),
        ('order_in_transit', 'Yuk yo\'lda'),
        ('order_completed', 'Buyurtma yakunlandi'),
        ('stop_alert', 'To\'xtash ogohlantirishi'),
        ('route_deviation', 'Marshrutdan og\'ish'),
        ('order_cancelled', 'Buyurtma bekor qilindi'),
        ('payment_received', 'To\'lov qabul qilindi'),
        ('driver_assigned', 'Haydovchi tayinlandi'),
        ('message_received', 'Xabar qabul qilindi'),
        ('rating_received', 'Reyting qoldirildi'),
        ('geofence_event', 'Geofence hodisasi'),
        ('document_expiry', 'Hujjat muddati tugashi'),
        ('bid_received', 'Yangi taklif'),
        ('route_stop_arrived', 'Marshrut nuqtasiga yetib kelish'),
        ('route_stop_completed', 'Marshrut nuqtasi yakunlandi'),
        ('driver_verification_pending', 'Haydovchi verifikatsiyasi kutilmoqda'),
        ('vehicle_verification_pending', 'Transport verifikatsiyasi kutilmoqda'),
        ('driver_verification_approved', 'Haydovchi tasdiqlandi'),
        ('driver_verification_rejected', 'Haydovchi hujjatlari rad etildi'),
        ('vehicle_verification_approved', 'Transport tasdiqlandi'),
        ('vehicle_verification_rejected', 'Transport rad etildi'),
        ('driver_sos', 'Haydovchi SOS signali'),
        ('driver_arriving', 'Haydovchi yaqinlashmoqda'),
        ('saved_search_match', 'Saqlangan qidiruv mosligi'),
        ('driver_load_offer', 'Haydovchiga mos yuk'),
        ('complaint_filed', 'Yangi shikoyat'),
        ('proof_of_delivery', 'POD yuborildi'),
        ('system', 'Tizim xabari'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications')
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='notifications', null=True, blank=True)
    advertisement = models.ForeignKey(
        Advertisement,
        on_delete=models.CASCADE,
        related_name='notifications',
        null=True,
        blank=True,
    )
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


class UserNotificationSettings(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='notification_settings')
    push_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_notification_settings'

    def __str__(self):
        return f"Notification settings for {self.user.phone}"


class NotificationPreference(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notification_preferences')
    notification_type = models.CharField(max_length=50, choices=Notification.NOTIFICATION_TYPES)
    push_enabled = models.BooleanField(default=True)
    in_app_enabled = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'notification_preferences'
        unique_together = [('user', 'notification_type')]

    def __str__(self):
        return f"{self.user.phone} - {self.notification_type}"


class PushDeliveryQueue(models.Model):
    STATUS_PENDING = 'pending'
    STATUS_SENT = 'sent'
    STATUS_FAILED = 'failed'
    STATUS_DEAD = 'dead'
    STATUS_CHOICES = [
        (STATUS_PENDING, 'Pending'),
        (STATUS_SENT, 'Sent'),
        (STATUS_FAILED, 'Failed'),
        (STATUS_DEAD, 'Dead'),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='push_queue_items')
    notification = models.ForeignKey(
        Notification,
        on_delete=models.SET_NULL,
        related_name='push_attempts',
        null=True,
        blank=True,
    )
    title = models.CharField(max_length=255)
    body = models.TextField()
    data = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    attempts = models.PositiveIntegerField(default=0)
    max_attempts = models.PositiveIntegerField(default=5)
    next_retry_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default='')
    sent_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'push_delivery_queue'
        ordering = ['created_at']
        indexes = [
            models.Index(fields=['status', 'next_retry_at']),
            models.Index(fields=['user', 'status']),
        ]

    def __str__(self):
        return f"Push queue #{self.id} ({self.status})"
