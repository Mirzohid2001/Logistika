from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('advertisements', '0001_initial'),
        ('notifications', '0002_expand_notification_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='notification',
            name='advertisement',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='notifications',
                to='advertisements.advertisement',
            ),
        ),
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(
                choices=[
                    ('order_created', 'Buyurtma yaratildi'),
                    ('order_accepted', 'Buyurtma qabul qilindi'),
                    ('order_approved', 'Buyurtma tasdiqlandi'),
                    ('order_started', 'Buyurtma boshlandi'),
                    ('order_completed', 'Buyurtma yakunlandi'),
                    ('order_cancelled', 'Buyurtma bekor qilindi'),
                    ('payment_received', "To'lov qabul qilindi"),
                    ('driver_assigned', 'Haydovchi tayinlandi'),
                    ('message_received', 'Xabar qabul qilindi'),
                    ('rating_received', 'Reyting qoldirildi'),
                    ('geofence_event', 'Geofence hodisasi'),
                    ('document_expiry', 'Hujjat muddati tugashi'),
                    ('bid_received', 'Yangi taklif'),
                    ('system', 'Tizim xabari'),
                ],
                max_length=50,
            ),
        ),
    ]
