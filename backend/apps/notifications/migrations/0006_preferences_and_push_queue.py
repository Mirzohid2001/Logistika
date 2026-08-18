from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('notifications', '0005_alter_notification_notification_type'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                choices=[
                    ('order_created', 'Buyurtma yaratildi'),
                    ('order_accepted', 'Buyurtma qabul qilindi'),
                    ('order_approved', 'Buyurtma tasdiqlandi'),
                    ('order_started', 'Buyurtma boshlandi'),
                    ('order_in_transit', "Yuk yo'lda"),
                    ('order_completed', 'Buyurtma yakunlandi'),
                    ('stop_alert', "To'xtash ogohlantirishi"),
                    ('route_deviation', "Marshrutdan og'ish"),
                    ('order_cancelled', 'Buyurtma bekor qilindi'),
                    ('payment_received', "To'lov qabul qilindi"),
                    ('driver_assigned', 'Haydovchi tayinlandi'),
                    ('message_received', 'Xabar qabul qilindi'),
                    ('rating_received', 'Reyting qoldirildi'),
                    ('geofence_event', 'Geofence hodisasi'),
                    ('document_expiry', 'Hujjat muddati tugashi'),
                    ('bid_received', 'Yangi taklif'),
                    ('route_stop_arrived', 'Marshrut nuqtasiga yetib kelish'),
                    ('route_stop_completed', 'Marshrut nuqtasi yakunlandi'),
                    ('system', 'Tizim xabari'),
                ],
                max_length=50,
            ),
        ),
        migrations.CreateModel(
            name='UserNotificationSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('push_enabled', models.BooleanField(default=True)),
                ('in_app_enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='notification_settings', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_notification_settings',
            },
        ),
        migrations.CreateModel(
            name='NotificationPreference',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('notification_type', models.CharField(choices=[('order_created', 'Buyurtma yaratildi'), ('order_accepted', 'Buyurtma qabul qilindi'), ('order_approved', 'Buyurtma tasdiqlandi'), ('order_started', 'Buyurtma boshlandi'), ('order_in_transit', "Yuk yo'lda"), ('order_completed', 'Buyurtma yakunlandi'), ('stop_alert', "To'xtash ogohlantirishi"), ('route_deviation', "Marshrutdan og'ish"), ('order_cancelled', 'Buyurtma bekor qilindi'), ('payment_received', "To'lov qabul qilindi"), ('driver_assigned', 'Haydovchi tayinlandi'), ('message_received', 'Xabar qabul qilindi'), ('rating_received', 'Reyting qoldirildi'), ('geofence_event', 'Geofence hodisasi'), ('document_expiry', 'Hujjat muddati tugashi'), ('bid_received', 'Yangi taklif'), ('route_stop_arrived', 'Marshrut nuqtasiga yetib kelish'), ('route_stop_completed', 'Marshrut nuqtasi yakunlandi'), ('system', 'Tizim xabari')], max_length=50)),
                ('push_enabled', models.BooleanField(default=True)),
                ('in_app_enabled', models.BooleanField(default=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notification_preferences', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'notification_preferences',
                'unique_together': {('user', 'notification_type')},
            },
        ),
        migrations.CreateModel(
            name='PushDeliveryQueue',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('title', models.CharField(max_length=255)),
                ('body', models.TextField()),
                ('data', models.JSONField(blank=True, default=dict)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('sent', 'Sent'), ('failed', 'Failed'), ('dead', 'Dead')], default='pending', max_length=20)),
                ('attempts', models.PositiveIntegerField(default=0)),
                ('max_attempts', models.PositiveIntegerField(default=5)),
                ('next_retry_at', models.DateTimeField(blank=True, null=True)),
                ('last_error', models.TextField(blank=True, default='')),
                ('sent_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('notification', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='push_attempts', to='notifications.notification')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='push_queue_items', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'push_delivery_queue',
                'ordering': ['created_at'],
            },
        ),
        migrations.AddIndex(
            model_name='pushdeliveryqueue',
            index=models.Index(fields=['status', 'next_retry_at'], name='push_deliv_status_idx'),
        ),
        migrations.AddIndex(
            model_name='pushdeliveryqueue',
            index=models.Index(fields=['user', 'status'], name='push_deliv_user_status_idx'),
        ),
    ]
