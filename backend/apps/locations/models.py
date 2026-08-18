from django.db import models


class Country(models.Model):
    name_ru = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    name_uz = models.CharField(max_length=100)
    code = models.CharField(max_length=3, unique=True)

    class Meta:
        db_table = 'countries'
        verbose_name = 'Country'
        verbose_name_plural = 'Countries'
        ordering = ['name_ru']

    def __str__(self):
        return self.name_ru


class City(models.Model):
    country = models.ForeignKey(Country, on_delete=models.CASCADE, related_name='cities')
    name_ru = models.CharField(max_length=100)
    name_en = models.CharField(max_length=100)
    name_uz = models.CharField(max_length=100)
    latitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)
    longitude = models.DecimalField(max_digits=9, decimal_places=6, null=True, blank=True)

    class Meta:
        db_table = 'cities'
        verbose_name = 'City'
        verbose_name_plural = 'Cities'
        ordering = ['name_ru']
        unique_together = ['country', 'name_ru']

    def __str__(self):
        return f"{self.name_ru}, {self.country.name_ru}"
