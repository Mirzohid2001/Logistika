from django.db import models


class StaticContent(models.Model):
    CONTENT_TYPE_CHOICES = [
        ('public_offer', 'Public Offer'),
        ('disclaimer', 'Disclaimer'),
        ('guide_clients', 'Guide for Clients'),
        ('guide_drivers', 'Guide for Drivers'),
        ('settings', 'Settings'),
    ]
    
    content_type = models.CharField(max_length=20, choices=CONTENT_TYPE_CHOICES, unique=True)
    content_ru = models.TextField()
    content_en = models.TextField()
    content_uz = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'static_content'
        verbose_name = 'Static Content'
        verbose_name_plural = 'Static Contents'

    def __str__(self):
        return self.get_content_type_display()
