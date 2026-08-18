import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('subscriptions', '0003_plan_pricing_and_intro_discount'),
    ]

    operations = [
        migrations.CreateModel(
            name='TrialDeviceGrant',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('device_id', models.CharField(max_length=128, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('granted_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='trial_device_grants', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'trial_device_grants',
            },
        ),
        migrations.CreateModel(
            name='MarketplaceTrialAccount',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('free_uses_granted', models.PositiveSmallIntegerField(default=3)),
                ('free_uses_consumed', models.PositiveSmallIntegerField(default=0)),
                ('trial_disabled', models.BooleanField(default=False, help_text="Admin yoki qurilma qayta ishlatilganda trial o'chiriladi")),
                ('disabled_reason', models.CharField(blank=True, default='', max_length=50)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='marketplace_trial', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'marketplace_trial_accounts',
            },
        ),
    ]
