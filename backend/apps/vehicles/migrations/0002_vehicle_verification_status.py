from django.db import migrations, models


def forwards(apps, schema_editor):
    Vehicle = apps.get_model('vehicles', 'Vehicle')
    for vehicle in Vehicle.objects.all().iterator():
        if vehicle.is_verified:
            status = 'approved'
        elif vehicle.document_photos:
            status = 'pending'
        else:
            status = 'not_submitted'
        Vehicle.objects.filter(pk=vehicle.pk).update(verification_status=status)


class Migration(migrations.Migration):

    dependencies = [
        ('vehicles', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehicle',
            name='verification_status',
            field=models.CharField(
                choices=[
                    ('not_submitted', 'Not submitted'),
                    ('pending', 'Pending review'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                ],
                default='not_submitted',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
    ]
