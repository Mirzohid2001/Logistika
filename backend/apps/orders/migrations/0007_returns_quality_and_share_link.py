import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0006_order_geofence_automation_fields'),
        ('users', '0006_driverdocument'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='eta_share_enabled',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='order',
            name='eta_share_expires_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.CreateModel(
            name='OrderReturnQuality',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('quality_status', models.CharField(choices=[('ok', 'OK'), ('opened', 'Opened'), ('damaged', 'Damaged')], max_length=20)),
                ('photo', models.ImageField(blank=True, null=True, upload_to='orders/returns/')),
                ('note', models.TextField(blank=True, default='')),
                ('classified_at', models.DateTimeField(auto_now_add=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('classified_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='classified_returns', to='users.user')),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='return_quality', to='orders.order')),
            ],
            options={
                'verbose_name': 'Order Return Quality',
                'verbose_name_plural': 'Order Return Qualities',
                'db_table': 'order_return_quality',
                'ordering': ['-classified_at'],
            },
        ),
        migrations.CreateModel(
            name='OrderTrackingShareLink',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('token', models.UUIDField(default=uuid.uuid4, editable=False, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('expires_at', models.DateTimeField()),
                ('last_accessed_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='created_tracking_links', to='users.user')),
                ('order', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='tracking_share', to='orders.order')),
            ],
            options={
                'verbose_name': 'Order Tracking Share Link',
                'verbose_name_plural': 'Order Tracking Share Links',
                'db_table': 'order_tracking_share_links',
                'ordering': ['-created_at'],
            },
        ),
    ]
