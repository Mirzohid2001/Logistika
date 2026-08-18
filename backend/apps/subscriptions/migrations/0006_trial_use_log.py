import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0015_order_agreed_amount_and_source_bid'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('subscriptions', '0005_rename_user_subscr_user_id_0f0f0d_idx_user_subscr_user_id_a34786_idx'),
    ]

    operations = [
        migrations.CreateModel(
            name='TrialUseLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='trial_use_logs', to='orders.order')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='trial_use_logs', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'trial_use_logs',
            },
        ),
        migrations.AddConstraint(
            model_name='trialuselog',
            constraint=models.UniqueConstraint(fields=('user', 'order'), name='trial_use_log_user_order_uniq'),
        ),
    ]
