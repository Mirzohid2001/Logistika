from django.db import migrations, models


def backfill_city_coordinates(apps, schema_editor):
    City = apps.get_model('locations', 'City')
    from apps.locations.seed_data import UZBEKISTAN_CITIES

    for row in UZBEKISTAN_CITIES:
        if not isinstance(row, dict):
            continue
        lat = row.get('latitude')
        lng = row.get('longitude')
        if lat is None or lng is None:
            continue
        City.objects.filter(name_ru=row['name_ru'], latitude__isnull=True).update(
            latitude=lat,
            longitude=lng,
        )
        City.objects.filter(name_en=row['name_en'], latitude__isnull=True).update(
            latitude=lat,
            longitude=lng,
        )


class Migration(migrations.Migration):
    dependencies = [
        ('locations', '0002_seed_default_locations'),
    ]

    operations = [
        migrations.AddField(
            model_name='city',
            name='latitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.AddField(
            model_name='city',
            name='longitude',
            field=models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True),
        ),
        migrations.RunPython(backfill_city_coordinates, migrations.RunPython.noop),
    ]
