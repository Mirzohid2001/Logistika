from django.db import migrations


def add_approved_status(apps, schema_editor):
    OrderStatus = apps.get_model('orders', 'OrderStatus')
    OrderStatus.objects.get_or_create(
        code='approved_by_client',
        defaults={
            'name_ru': 'Одобрен клиентом',
            'name_en': 'Approved by Client',
            'name_uz': 'Mijoz tomonidan tasdiqlangan',
        },
    )


def remove_approved_status(apps, schema_editor):
    OrderStatus = apps.get_model('orders', 'OrderStatus')
    OrderStatus.objects.filter(code='approved_by_client').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0009_add_in_transit_status'),
    ]

    operations = [
        migrations.RunPython(add_approved_status, remove_approved_status),
    ]
