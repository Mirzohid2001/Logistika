from django.db import migrations


def add_in_transit_status(apps, schema_editor):
    OrderStatus = apps.get_model('orders', 'OrderStatus')
    OrderStatus.objects.get_or_create(
        code='in_transit',
        defaults={
            'name_ru': 'В пути',
            'name_en': 'In Transit',
            'name_uz': "Yo'lda",
        },
    )


def remove_in_transit_status(apps, schema_editor):
    OrderStatus = apps.get_model('orders', 'OrderStatus')
    OrderStatus.objects.filter(code='in_transit').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0008_add_driver_presence_fields'),
    ]

    operations = [
        migrations.RunPython(add_in_transit_status, remove_in_transit_status),
    ]
