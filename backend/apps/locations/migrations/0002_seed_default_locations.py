from django.db import migrations


def seed_default_locations(apps, schema_editor):
    Country = apps.get_model('locations', 'Country')
    City = apps.get_model('locations', 'City')

    if Country.objects.exists():
        return

    from apps.locations.seed_data import DEFAULT_COUNTRIES, UZBEKISTAN_CITIES

    country_by_code = {}
    for item in DEFAULT_COUNTRIES:
        country = Country.objects.create(**item)
        country_by_code[item['code']] = country

    uz = country_by_code.get('UZ')
    if not uz:
        return

    for row in UZBEKISTAN_CITIES:
        if isinstance(row, dict):
            City.objects.create(
                country=uz,
                name_ru=row['name_ru'],
                name_en=row['name_en'],
                name_uz=row['name_uz'],
            )
        else:
            name_ru, name_en, name_uz = row[:3]
            City.objects.create(
                country=uz,
                name_ru=name_ru,
                name_en=name_en,
                name_uz=name_uz,
            )


class Migration(migrations.Migration):
    dependencies = [
        ('locations', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_default_locations, migrations.RunPython.noop),
    ]
