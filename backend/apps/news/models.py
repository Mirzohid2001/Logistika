from django.db import models


class News(models.Model):
    photo = models.ImageField(upload_to='news/', null=True, blank=True)
    title_ru = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200)
    title_uz = models.CharField(max_length=200)
    text_ru = models.TextField()
    text_en = models.TextField()
    text_uz = models.TextField()
    date = models.DateField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'news'
        verbose_name = 'News'
        verbose_name_plural = 'News'
        ordering = ['-date']

    def __str__(self):
        return self.title_ru
