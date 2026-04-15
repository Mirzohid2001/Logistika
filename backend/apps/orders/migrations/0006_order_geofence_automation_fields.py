from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0005_order_orders_client__bc22a2_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='destination_entered_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='destination_geofence_radius_meters',
            field=models.PositiveIntegerField(default=300),
        ),
        migrations.AddField(
            model_name='order',
            name='is_in_destination_geofence',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='is_in_pickup_geofence',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='pickup_entered_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pickup_exited_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='pickup_geofence_radius_meters',
            field=models.PositiveIntegerField(default=300),
        ),
    ]
