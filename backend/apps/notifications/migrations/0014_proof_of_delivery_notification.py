from django.db import migrations, models


CHOICES = [
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
    ('driver_verification_pending', 'Haydovchi verifikatsiyasi kutilmoqda'),
    ('vehicle_verification_pending', 'Transport verifikatsiyasi kutilmoqda'),
    ('driver_verification_approved', 'Haydovchi tasdiqlandi'),
    ('driver_verification_rejected', 'Haydovchi hujjatlari rad etildi'),
    ('vehicle_verification_approved', 'Transport tasdiqlandi'),
    ('vehicle_verification_rejected', 'Transport rad etildi'),
    ('driver_sos', 'Haydovchi SOS signali'),
    ('driver_arriving', 'Haydovchi yaqinlashmoqda'),
    ('saved_search_match', 'Saqlangan qidiruv mosligi'),
    ('driver_load_offer', 'Haydovchiga mos yuk'),
    ('complaint_filed', 'Yangi shikoyat'),
    ('proof_of_delivery', 'POD yuborildi'),
    ('system', 'Tizim xabari'),
]


class Migration(migrations.Migration):

    dependencies = [
        ('notifications', '0013_driver_load_offer'),
    ]

    operations = [
        migrations.AlterField(
            model_name='notification',
            name='notification_type',
            field=models.CharField(choices=CHOICES, max_length=50),
        ),
        migrations.AlterField(
            model_name='notificationpreference',
            name='notification_type',
            field=models.CharField(choices=CHOICES, max_length=50),
        ),
    ]
