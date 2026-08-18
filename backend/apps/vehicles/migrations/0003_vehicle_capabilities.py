from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('vehicles', '0002_vehicle_verification_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='vehicle',
            name='body_type',
            field=models.CharField(
                choices=[
                    ('tent', 'Tent'),
                    ('reefer', 'Reefer'),
                    ('tanker', 'Tanker'),
                    ('open', 'Open'),
                    ('van', 'Van'),
                    ('other', 'Other'),
                ],
                default='other',
                max_length=20,
            ),
        ),
        migrations.AddField(
            model_name='vehicle',
            name='has_adr',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='vehicle',
            name='is_reefer',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='vehicle',
            name='is_heavy_haul',
            field=models.BooleanField(default=False),
        ),
    ]
