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
