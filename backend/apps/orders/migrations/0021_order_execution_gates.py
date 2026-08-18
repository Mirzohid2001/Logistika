from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0020_orderdocument_pdf_and_cmr'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='in_transit_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='client_delivery_confirmed',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='client_delivery_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='loaded_distance_meters',
            field=models.PositiveIntegerField(blank=True, null=True),
        ),
    ]
