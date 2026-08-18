from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0002_seed_subscription_plans'),
    ]

    operations = [
        migrations.AddField(
            model_name='subscriptionplan',
            name='first_period_discount_percent',
            field=models.PositiveSmallIntegerField(
                default=50,
                help_text='Birinchi obuna uchun chegirma foizi (masalan 50 = -50%)',
                validators=[
                    django.core.validators.MinValueValidator(0),
                    django.core.validators.MaxValueValidator(100),
                ],
            ),
        ),
        migrations.AddField(
            model_name='usersubscription',
            name='charged_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Foydalanuvchi to'lagan summa",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='usersubscription',
            name='intro_discount_percent',
            field=models.PositiveSmallIntegerField(default=0),
        ),
        migrations.AddField(
            model_name='usersubscription',
            name='is_intro_purchase',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='usersubscription',
            name='list_price',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="To'liq narx (chegirmasiz)",
                max_digits=12,
                null=True,
            ),
        ),
        migrations.AlterField(
            model_name='subscriptionplan',
            name='price',
            field=models.DecimalField(
                decimal_places=2,
                help_text="Keyingi oylar uchun to'liq narx",
                max_digits=12,
            ),
        ),
    ]
