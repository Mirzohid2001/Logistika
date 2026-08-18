from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0017_order_tracked_distance'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='current_speed_mps',
            field=models.FloatField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='order',
            name='current_heading',
            field=models.FloatField(blank=True, null=True),
        ),
    ]
