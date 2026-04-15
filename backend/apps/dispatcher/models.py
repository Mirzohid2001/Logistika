from django.db import models
from apps.users.models import User
from apps.orders.models import Order


class DispatcherAssignment(models.Model):
    dispatcher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dispatcher_assignments', limit_choices_to={'is_dispatcher': True})
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='dispatcher_assignments')
    assigned_driver = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True, related_name='assigned_orders', limit_choices_to={'is_driver': True})
    assigned_at = models.DateTimeField(auto_now_add=True)
    reassigned_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=[
            ('assigned', 'Tayinlangan'),
            ('reassigned', 'Qayta tayinlangan'),
            ('cancelled', 'Bekor qilingan'),
            ('completed', 'Yakunlangan'),
        ],
        default='assigned'
    )
    notes = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dispatcher_assignments'
        verbose_name = 'Dispatcher Assignment'
        verbose_name_plural = 'Dispatcher Assignments'
        ordering = ['-assigned_at']

    def __str__(self):
        return f"Assignment {self.id} - Order {self.order.id} by {self.dispatcher.phone}"


class DispatcherNote(models.Model):
    dispatcher = models.ForeignKey(User, on_delete=models.CASCADE, related_name='dispatcher_notes', limit_choices_to={'is_dispatcher': True})
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='dispatcher_notes')
    note = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'dispatcher_notes'
        verbose_name = 'Dispatcher Note'
        verbose_name_plural = 'Dispatcher Notes'
        ordering = ['-created_at']

    def __str__(self):
        return f"Note {self.id} for Order {self.order.id}"


class DispatcherExceptionAction(models.Model):
    EXCEPTION_TYPE_STALE_LOCATION = 'stale_location'
    EXCEPTION_TYPE_DELAYED_PENDING = 'delayed_pending'
    EXCEPTION_TYPE_PROBLEMATIC_STATUS = 'problematic_status'
    EXCEPTION_TYPE_ROUTE_DEVIATION = 'route_deviation'

    EXCEPTION_TYPE_CHOICES = [
        (EXCEPTION_TYPE_STALE_LOCATION, 'Stale location'),
        (EXCEPTION_TYPE_DELAYED_PENDING, 'Delayed pending'),
        (EXCEPTION_TYPE_PROBLEMATIC_STATUS, 'Problematic status'),
        (EXCEPTION_TYPE_ROUTE_DEVIATION, 'Route deviation'),
    ]

    dispatcher = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='dispatcher_exception_actions',
        limit_choices_to={'is_dispatcher': True},
    )
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='dispatcher_exception_actions')
    exception_type = models.CharField(max_length=40, choices=EXCEPTION_TYPE_CHOICES)
    acknowledged_at = models.DateTimeField(null=True, blank=True)
    snoozed_until = models.DateTimeField(null=True, blank=True)
    note = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'dispatcher_exception_actions'
        verbose_name = 'Dispatcher Exception Action'
        verbose_name_plural = 'Dispatcher Exception Actions'
        unique_together = ['dispatcher', 'order', 'exception_type']
        indexes = [
            models.Index(fields=['dispatcher', 'exception_type']),
            models.Index(fields=['snoozed_until']),
            models.Index(fields=['acknowledged_at']),
        ]

    def __str__(self):
        return f"{self.dispatcher.phone} - Order {self.order_id} - {self.exception_type}"
