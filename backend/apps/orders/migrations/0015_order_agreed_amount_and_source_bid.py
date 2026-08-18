from decimal import Decimal

import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('bids', '0003_bid_last_counter_by'),
        ('orders', '0014_custody_chain_and_sos'),
    ]

    operations = [
        migrations.AddField(
            model_name='order',
            name='agreed_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Buyurtma yaratilganda kelishilgan narx',
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='order',
            name='source_bid',
            field=models.ForeignKey(
                blank=True,
                help_text='Buyurtmaga asos bo‘lgan qabul qilingan taklif',
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='orders',
                to='bids.bid',
            ),
        ),
    ]
