from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0001_initial'),
        ('orders', '0003_create_default_order_statuses'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='planned_route_points',
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name='order',
            name='route_deviation_count',
            field=models.PositiveIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='order',
            name='route_deviation_last_alert_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='route_deviation_last_distance_meters',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='route_deviation_threshold_meters',
            field=models.PositiveIntegerField(default=500),
        ),
        migrations.CreateModel(
            name='OrderProofOfDelivery',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('receiver_name', models.CharField(max_length=255)),
                ('receiver_signature', models.TextField(blank=True, default='')),
                ('delivery_photo', models.ImageField(blank=True, null=True, upload_to='orders/pod/')),
                ('delivered_lat', models.DecimalField(decimal_places=6, max_digits=9)),
                ('delivered_lng', models.DecimalField(decimal_places=6, max_digits=9)),
                ('delivered_at', models.DateTimeField(auto_now_add=True)),
                ('note', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('delivered_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='delivered_orders_pod', to='users.user')),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='proof_of_delivery', to='orders.order')),
            ],
            options={
                'verbose_name': 'Order Proof Of Delivery',
                'verbose_name_plural': 'Order Proof Of Deliveries',
                'db_table': 'order_proof_of_delivery',
                'ordering': ['-delivered_at'],
            },
        ),
    ]
