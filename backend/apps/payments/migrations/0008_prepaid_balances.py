import decimal

import django.core.validators
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


def enable_prepaid_commissions(apps, schema_editor):
    FeeSettings = apps.get_model('payments', 'OrderCompletionFeeSettings')
    ExchangeRateSettings = apps.get_model('payments', 'BalanceExchangeRateSettings')
    CompletionFee = apps.get_model('payments', 'OrderCompletionFee')

    fee_settings, _created = FeeSettings.objects.get_or_create(pk=1)
    if fee_settings.client_fee_amount <= 0 and fee_settings.driver_fee_amount <= 0:
        fee_settings.client_fee_amount = decimal.Decimal('50.00')
        fee_settings.driver_fee_amount = decimal.Decimal('50.00')
        fee_settings.currency = 'USD'
    fee_settings.is_enabled = True
    fee_settings.save()
    ExchangeRateSettings.objects.get_or_create(pk=1)

    # Old post-order debts must not block users after switching to prepayment.
    CompletionFee.objects.filter(status='pending').update(status='waived')


class Migration(migrations.Migration):

    dependencies = [
        ('advertisements', '0012_rename_driver_lane_user_id_is_act_idx_driver_lane_user_id_d14cb6_idx'),
        ('orders', '0022_rename_order_custo_order_i_6f0a2a_idx_order_custo_order_i_940b0c_idx_and_more'),
        ('payments', '0007_order_completion_fees'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.AlterField(
            model_name='ordercompletionfeesettings',
            name='is_enabled',
            field=models.BooleanField(default=True),
        ),
        migrations.AlterField(
            model_name='ordercompletionfeesettings',
            name='client_fee_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=50,
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal('0'))],
            ),
        ),
        migrations.AlterField(
            model_name='ordercompletionfeesettings',
            name='driver_fee_amount',
            field=models.DecimalField(
                decimal_places=2,
                default=50,
                max_digits=12,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal('0'))],
            ),
        ),
        migrations.AlterField(
            model_name='ordercompletionfeesettings',
            name='currency',
            field=models.CharField(
                choices=[('UZS', "UZS (so'm)"), ('USD', 'USD ($)')],
                default='USD',
                max_length=3,
            ),
        ),
        migrations.AlterModelOptions(
            name='ordercompletionfeesettings',
            options={
                'verbose_name': 'Prepaid order commission settings',
                'verbose_name_plural': 'Prepaid order commission settings',
            },
        ),
        migrations.CreateModel(
            name='BalanceExchangeRateSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                (
                    'usd_to_uzs',
                    models.DecimalField(
                        decimal_places=2,
                        default=13000,
                        help_text='UZS charged by the gateway for each 1 USD credited to a balance.',
                        max_digits=14,
                        validators=[django.core.validators.MinValueValidator(decimal.Decimal('1'))],
                    ),
                ),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'balance_exchange_rate_settings',
                'verbose_name': 'Balance exchange rate settings',
                'verbose_name_plural': 'Balance exchange rate settings',
            },
        ),
        migrations.CreateModel(
            name='AccountBalance',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('balance_type', models.CharField(choices=[('order', 'Order balance'), ('commission', 'Commission balance')], max_length=16)),
                ('currency', models.CharField(choices=[('UZS', "UZS (so'm)"), ('USD', 'USD ($)')], max_length=3)),
                ('available', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('reserved', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='account_balances', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'account_balances',
                'ordering': ['balance_type', 'currency'],
                'indexes': [models.Index(fields=['user', 'balance_type'], name='account_balance_user_type_idx')],
                'constraints': [
                    models.UniqueConstraint(fields=('user', 'balance_type', 'currency'), name='unique_user_balance_type_currency'),
                    models.CheckConstraint(condition=models.Q(('available__gte', 0)), name='account_balance_available_nonnegative'),
                    models.CheckConstraint(condition=models.Q(('reserved__gte', 0)), name='account_balance_reserved_nonnegative'),
                ],
            },
        ),
        migrations.CreateModel(
            name='BalanceReservation',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('purpose', models.CharField(choices=[('client_order', 'Client order funds'), ('client_commission', 'Client commission'), ('driver_commission', 'Driver commission')], max_length=24)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14, validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.01'))])),
                ('currency', models.CharField(choices=[('UZS', "UZS (so'm)"), ('USD', 'USD ($)')], max_length=3)),
                (
                    'settlement_uzs_rate',
                    models.DecimalField(
                        blank=True,
                        decimal_places=2,
                        help_text='Locked UZS rate used to pay the driver; set only for client order funds.',
                        max_digits=14,
                        null=True,
                        validators=[django.core.validators.MinValueValidator(decimal.Decimal('1'))],
                    ),
                ),
                ('status', models.CharField(choices=[('held', 'Held'), ('captured', 'Captured'), ('released', 'Released')], default='held', max_length=12)),
                ('captured_at', models.DateTimeField(blank=True, null=True)),
                ('released_at', models.DateTimeField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('advertisement', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balance_reservations', to='advertisements.advertisement')),
                ('balance', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='reservations', to='payments.accountbalance')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='balance_reservations', to='orders.order')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balance_reservations', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'balance_reservations',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['user', 'status'], name='balance_res_user_status_idx'),
                    models.Index(fields=['order', 'purpose'], name='balance_res_order_purpose_idx'),
                ],
                'constraints': [
                    models.UniqueConstraint(
                        condition=models.Q(('status', 'held')),
                        fields=('advertisement', 'purpose'),
                        name='unique_held_advertisement_balance_purpose',
                    ),
                    models.CheckConstraint(condition=models.Q(('amount__gt', 0)), name='balance_reservation_amount_positive'),
                ],
            },
        ),
        migrations.CreateModel(
            name='BalanceEntry',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('entry_type', models.CharField(choices=[('top_up', 'Top up'), ('reserve', 'Reserve'), ('release', 'Release'), ('capture', 'Capture'), ('admin_adjustment', 'Admin adjustment')], max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=14)),
                ('available_delta', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('reserved_delta', models.DecimalField(decimal_places=2, default=0, max_digits=14)),
                ('idempotency_key', models.CharField(max_length=160, unique=True)),
                ('note', models.CharField(blank=True, default='', max_length=255)),
                ('metadata', models.JSONField(blank=True, default=dict)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('advertisement', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='balance_entries', to='advertisements.advertisement')),
                ('balance', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='entries', to='payments.accountbalance')),
                ('order', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='balance_entries', to='orders.order')),
                ('payment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='balance_entries', to='payments.payment')),
                ('reservation', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='entries', to='payments.balancereservation')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='balance_entries', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'balance_entries',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['user', 'created_at'], name='balance_entry_user_date_idx'),
                    models.Index(fields=['entry_type', 'created_at'], name='balance_entry_type_date_idx'),
                ],
            },
        ),
        migrations.RunPython(enable_prepaid_commissions, migrations.RunPython.noop),
    ]
