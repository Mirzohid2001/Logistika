from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0002_expand_notification_types'),
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
                    ('order_in_transit', 'Yuk yo\'lda'),
                    ('order_completed', 'Buyurtma yakunlandi'),
                    ('order_cancelled', 'Buyurtma bekor qilindi'),
                    ('payment_received', "To'lov qabul qilindi"),
                    ('driver_assigned', 'Haydovchi tayinlandi'),
                    ('message_received', 'Xabar qabul qilindi'),
                    ('rating_received', 'Reyting qoldirildi'),
                    ('geofence_event', 'Geofence hodisasi'),
                    ('document_expiry', 'Hujjat muddati tugashi'),
                    ('bid_received', 'Yangi taklif'),
                    ('stop_alert', "To'xtash ogohlantirishi"),
                    ('route_deviation', "Marshrutdan og'ish"),
                    ('system', 'Tizim xabari'),
                ],
                max_length=50,
            ),
        ),
    ]
