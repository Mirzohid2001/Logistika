from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('dispatcher', '0002_dispatcherexceptionaction'),
    ]

    operations = [
        migrations.AlterField(
            model_name='dispatcherexceptionaction',
            name='exception_type',
            field=models.CharField(
                choices=[
                    ('stale_location', 'Stale location'),
                    ('delayed_pending', 'Delayed pending'),
                    ('problematic_status', 'Problematic status'),
                    ('route_deviation', 'Route deviation'),
                ],
                max_length=40
            ),
        ),
    ]
