# Generated manually for matching lane time windows

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('advertisements', '0010_matching_product'),
    ]

    operations = [
        migrations.AddField(
            model_name='driverlane',
            name='time_from_hour',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='driverlane',
            name='time_to_hour',
            field=models.PositiveSmallIntegerField(blank=True, null=True),
        ),
    ]
