import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('payments', '0005_add_mock_payment_method'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='SubscriptionPlan',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('code', models.CharField(max_length=50, unique=True)),
                ('audience', models.CharField(choices=[('client', 'Client'), ('driver', 'Driver')], max_length=20)),
                ('name_ru', models.CharField(max_length=120)),
                ('name_uz', models.CharField(max_length=120)),
                ('name_en', models.CharField(max_length=120)),
                ('description_ru', models.TextField(blank=True, default='')),
                ('description_uz', models.TextField(blank=True, default='')),
                ('description_en', models.TextField(blank=True, default='')),
                ('price', models.DecimalField(decimal_places=2, max_digits=12)),
                ('currency', models.CharField(default='UZS', max_length=3)),
                ('duration_days', models.PositiveIntegerField(default=30)),
                ('is_active', models.BooleanField(default=True)),
                ('sort_order', models.PositiveIntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'db_table': 'subscription_plans',
                'ordering': ['sort_order', 'price'],
            },
        ),
        migrations.CreateModel(
            name='UserSubscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('active', 'Active'), ('expired', 'Expired'), ('cancelled', 'Cancelled')], default='active', max_length=20)),
                ('started_at', models.DateTimeField(default=django.utils.timezone.now)),
                ('expires_at', models.DateTimeField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('payment', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='subscription_purchases', to='payments.payment')),
                ('plan', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='user_subscriptions', to='subscriptions.subscriptionplan')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='subscriptions', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'user_subscriptions',
                'ordering': ['-expires_at'],
            },
        ),
        migrations.AddIndex(
            model_name='usersubscription',
            index=models.Index(fields=['user', 'status', 'expires_at'], name='user_subscr_user_id_0f0f0d_idx'),
        ),
    ]
