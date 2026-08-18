from django.db import migrations, models
import apps.orders.models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0019_order_documents'),
    ]

    operations = [
        migrations.AddField(
            model_name='orderdocument',
            name='pdf_file',
            field=models.FileField(blank=True, upload_to=apps.orders.models.order_document_upload_to),
        ),
        migrations.AlterField(
            model_name='orderdocument',
            name='doc_type',
            field=models.CharField(
                choices=[
                    ('invoice', 'Hisob-faktura'),
                    ('ttn', 'TTN / yuk xati'),
                    ('cmr', 'CMR'),
                    ('act', 'Bajarilgan ishlar dalolatnomasi'),
                ],
                max_length=20,
            ),
        ),
    ]
