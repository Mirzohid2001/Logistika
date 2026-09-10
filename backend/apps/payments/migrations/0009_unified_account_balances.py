import decimal

import django.core.validators
from django.db import migrations, models


CENT = decimal.Decimal('0.01')


def _money(value):
    return decimal.Decimal(value or 0).quantize(CENT, rounding=decimal.ROUND_HALF_UP)


def _convert(amount, source, target, rate):
    amount = _money(amount)
    if source == target:
        return amount
    if source == 'USD':
        return _money(amount * rate)
    return _money(amount / rate)


def collapse_currency_wallets(apps, schema_editor):
    AccountBalance = apps.get_model('payments', 'AccountBalance')
    BalanceEntry = apps.get_model('payments', 'BalanceEntry')
    BalanceReservation = apps.get_model('payments', 'BalanceReservation')
    ExchangeSettings = apps.get_model('payments', 'BalanceExchangeRateSettings')

    settings = ExchangeSettings.objects.order_by('pk').first()
    rate = _money(settings.usd_to_uzs if settings else 13000)
    base_currencies = {'order': 'UZS', 'commission': 'USD'}
    pairs = AccountBalance.objects.values_list('user_id', 'balance_type').distinct()

    for user_id, balance_type in pairs.iterator():
        base_currency = base_currencies[balance_type]
        balances = list(
            AccountBalance.objects.filter(user_id=user_id, balance_type=balance_type).order_by('id')
        )
        target = next((item for item in balances if item.currency == base_currency), balances[0])
        available = decimal.Decimal('0')
        reserved = decimal.Decimal('0')

        for source in balances:
            available += _convert(source.available, source.currency, base_currency, rate)
            reserved += _convert(source.reserved, source.currency, base_currency, rate)

            for entry in BalanceEntry.objects.filter(balance_id=source.id).iterator():
                entry.amount = _convert(entry.amount, source.currency, base_currency, rate)
                entry.available_delta = _convert(
                    entry.available_delta,
                    source.currency,
                    base_currency,
                    rate,
                )
                entry.reserved_delta = _convert(
                    entry.reserved_delta,
                    source.currency,
                    base_currency,
                    rate,
                )
                entry.balance_id = target.id
                entry.save(update_fields=[
                    'amount', 'available_delta', 'reserved_delta', 'balance',
                ])

            for reservation in BalanceReservation.objects.filter(balance_id=source.id).iterator():
                reservation_rate = rate
                if balance_type == 'order' and reservation.currency == 'USD':
                    reservation_rate = _money(reservation.settlement_uzs_rate or rate)
                reservation.balance_amount = _convert(
                    reservation.amount,
                    reservation.currency,
                    base_currency,
                    reservation_rate,
                )
                reservation.balance_id = target.id
                reservation.save(update_fields=['balance_amount', 'balance'])

        AccountBalance.objects.filter(
            user_id=user_id,
            balance_type=balance_type,
        ).exclude(pk=target.pk).delete()
        target.currency = base_currency
        target.available = _money(available)
        target.reserved = _money(reserved)
        target.save(update_fields=['currency', 'available', 'reserved'])


class Migration(migrations.Migration):

    # PostgreSQL defers FK trigger checks while the data migration repoints
    # entries/reservations.  Committing between data and schema operations
    # prevents ALTER TABLE from colliding with those pending trigger events.
    atomic = False

    dependencies = [
        ('payments', '0008_prepaid_balances'),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name='accountbalance',
            name='unique_user_balance_type_currency',
        ),
        migrations.AddField(
            model_name='balancereservation',
            name='balance_amount',
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text='Amount held in the canonical currency of the linked balance.',
                max_digits=14,
                null=True,
            ),
        ),
        migrations.RunPython(collapse_currency_wallets, migrations.RunPython.noop),
        migrations.AlterField(
            model_name='balancereservation',
            name='balance_amount',
            field=models.DecimalField(
                decimal_places=2,
                help_text='Amount held in the canonical currency of the linked balance.',
                max_digits=14,
                validators=[django.core.validators.MinValueValidator(decimal.Decimal('0.01'))],
            ),
        ),
        migrations.AlterModelOptions(
            name='accountbalance',
            options={'ordering': ['balance_type']},
        ),
        migrations.AddConstraint(
            model_name='accountbalance',
            constraint=models.UniqueConstraint(
                fields=('user', 'balance_type'),
                name='unique_user_balance_type',
            ),
        ),
    ]
