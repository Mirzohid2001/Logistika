from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_order_offline_payment_flag'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='optimized_route_distance_meters',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='optimized_route_duration_seconds',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='optimized_route_polyline',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='order',
            name='route_optimization_provider',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.CreateModel(
            name='OrderRouteStop',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('sequence', models.PositiveIntegerField()),
                ('stop_type', models.CharField(choices=[('pickup', 'Pickup'), ('delivery', 'Delivery')], default='pickup', max_length=20)),
                ('label', models.CharField(blank=True, default='', max_length=255)),
                ('address', models.CharField(blank=True, default='', max_length=500)),
                ('lat', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('lng', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('geofence_radius_meters', models.PositiveIntegerField(default=300)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('arrived', 'Arrived'), ('completed', 'Completed'), ('skipped', 'Skipped')], default='pending', max_length=20)),
                ('arrived_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='route_stops', to='orders.order')),
            ],
            options={
                'db_table': 'order_route_stops',
                'ordering': ['sequence'],
            },
        ),
        migrations.AddIndex(
            model_name='orderlocationtrack',
            index=models.Index(fields=['order', 'timestamp'], name='order_locat_order_i_idx'),
        ),
        migrations.AddIndex(
            model_name='orderlocationtrack',
            index=models.Index(fields=['timestamp'], name='order_locat_timesta_idx'),
        ),
        migrations.AddIndex(
            model_name='orderroutestop',
            index=models.Index(fields=['order', 'status'], name='order_route_order_i_idx'),
        ),
        migrations.AlterUniqueTogether(
            name='orderroutestop',
            unique_together={('order', 'sequence')},
        ),
    ]
