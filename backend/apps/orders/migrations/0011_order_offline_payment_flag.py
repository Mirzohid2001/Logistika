from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0010_add_approved_by_client_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='client_payment_confirmed',
            field=models.BooleanField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='client_payment_confirmed_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
