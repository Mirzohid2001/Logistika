from django.db import models
from apps.users.models import User
from apps.orders.models import Order


class UpdateLog(models.Model):
    updater = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='update_logs', limit_choices_to={'is_updater': True})
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='update_logs')
    update_type = models.CharField(
        max_length=50,
        choices=[
            ('status', 'Status'),
            ('location', 'Location'),
            ('payment', 'Payment'),
            ('other', 'Other'),
        ]
    )
    old_value = models.JSONField(null=True, blank=True)
    new_value = models.JSONField(null=True, blank=True)
    description = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'update_logs'
        verbose_name = 'Update Log'
        verbose_name_plural = 'Update Logs'
        ordering = ['-created_at']

    def __str__(self):
        return f"Update {self.id} - {self.update_type} for Order {self.order.id}"
