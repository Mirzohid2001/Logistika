from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0015_order_agreed_amount_and_source_bid'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='client_paid_reported',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='client_paid_reported_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
