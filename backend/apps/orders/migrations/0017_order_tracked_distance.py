from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0016_order_client_paid_reported'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='tracked_distance_meters',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='tracked_distance_computed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
