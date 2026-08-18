from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0013_rename_order_locat_order_i_idx_order_locat_order_i_4dc17d_idx_and_more'),
        ('users', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='OrderCustodyEvent',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_type', models.CharField(choices=[('pickup_handed', 'Pickup handed'), ('stop_handed', 'Stop handed'), ('delivery_handed', 'Delivery handed'), ('seal_verified', 'Seal verified'), ('temperature_check', 'Temperature check')], max_length=30)),
                ('witness_name', models.CharField(blank=True, default='', max_length=255)),
                ('lat', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('lng', models.DecimalField(blank=True, decimal_places=6, max_digits=9, null=True)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='orders/custody/')),
                ('qr_token', models.CharField(blank=True, default='', max_length=64)),
                ('note', models.TextField(blank=True, default='')),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('actor', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='custody_events', to='users.user')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='custody_events', to='orders.order')),
            ],
            options={
                'db_table': 'order_custody_events',
                'ordering': ['created_at'],
            },
        ),
        migrations.CreateModel(
            name='OrderSOSAlert',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('lat', models.DecimalField(decimal_places=6, max_digits=9)),
                ('lng', models.DecimalField(decimal_places=6, max_digits=9)),
                ('message', models.CharField(blank=True, default='', max_length=500)),
                ('status', models.CharField(choices=[('active', 'Active'), ('acknowledged', 'Acknowledged'), ('resolved', 'Resolved')], default='active', max_length=20)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('resolved_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('acknowledged_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='acknowledged_sos_alerts', to='users.user')),
                ('driver', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sos_alerts', to='users.user')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='sos_alerts', to='orders.order')),
            ],
            options={
                'db_table': 'order_sos_alerts',
                'ordering': ['-created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='ordercustodyevent',
            index=models.Index(fields=['order', 'created_at'], name='order_custo_order_i_6f0a2a_idx'),
        ),
        migrations.AddIndex(
            model_name='ordercustodyevent',
            index=models.Index(fields=['event_type', 'created_at'], name='order_custo_event_t_0f2f0d_idx'),
        ),
        migrations.AddIndex(
            model_name='ordersosalert',
            index=models.Index(fields=['status', 'created_at'], name='order_sos_a_status_2f0f0d_idx'),
        ),
        migrations.AddIndex(
            model_name='ordersosalert',
            index=models.Index(fields=['order', 'status'], name='order_sos_a_order_i_0f0f0d_idx'),
        ),
    ]
