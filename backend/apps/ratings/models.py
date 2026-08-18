from django.db import models
from apps.users.models import User
from apps.orders.models import Order


class Rating(models.Model):
    RATING_CHOICES = [
        (1, '1 yulduz'),
        (2, '2 yulduz'),
        (3, '3 yulduz'),
        (4, '4 yulduz'),
        (5, '5 yulduz'),
    ]
    
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='ratings')
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ratings_given')
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='ratings_received')
    rating = models.IntegerField(choices=RATING_CHOICES)
    comment = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'ratings'
        verbose_name = 'Rating'
        verbose_name_plural = 'Ratings'
        unique_together = ['order', 'from_user', 'to_user']
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Rating {self.rating} from {self.from_user.phone} to {self.to_user.phone}"


class Complaint(models.Model):
    CATEGORY_CHOICES = [
        ('payment', 'Payment dispute'),
        ('behavior', 'Behavior'),
        ('cargo_damage', 'Cargo damage'),
        ('communication', 'Communication'),
        ('other', 'Other'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_review', 'In review'),
        ('resolved', 'Resolved'),
        ('dismissed', 'Dismissed'),
    ]

    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name='complaints')
    from_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='complaints_filed')
    to_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='complaints_received')
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, default='other')
    description = models.TextField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    admin_notes = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'complaints'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['order', 'from_user', 'to_user'],
                name='unique_complaint_per_order_party',
            ),
        ]
        indexes = [
            models.Index(fields=['to_user', 'status']),
            models.Index(fields=['from_user', 'created_at']),
        ]

    def __str__(self):
        return f"Complaint #{self.pk} order={self.order_id} {self.from_user_id}->{self.to_user_id}"
