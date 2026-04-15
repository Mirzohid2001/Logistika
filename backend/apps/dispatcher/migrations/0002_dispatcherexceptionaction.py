from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0001_initial'),
        ('users', '0001_initial'),
        ('dispatcher', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DispatcherExceptionAction',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('exception_type', models.CharField(choices=[('stale_location', 'Stale location'), ('delayed_pending', 'Delayed pending'), ('problematic_status', 'Problematic status')], max_length=40)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('snoozed_until', models.DateTimeField(blank=True, null=True)),
                ('note', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('dispatcher', models.ForeignKey(limit_choices_to={'is_dispatcher': True}, on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_exception_actions', to='users.user')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_exception_actions', to='orders.order')),
            ],
            options={
                'verbose_name': 'Dispatcher Exception Action',
                'verbose_name_plural': 'Dispatcher Exception Actions',
                'db_table': 'dispatcher_exception_actions',
                'unique_together': {('dispatcher', 'order', 'exception_type')},
            },
        ),
        migrations.AddIndex(
            model_name='dispatcherexceptionaction',
            index=models.Index(fields=['dispatcher', 'exception_type'], name='dispatcher_e_dispatc_4f7ec6_idx'),
        ),
        migrations.AddIndex(
            model_name='dispatcherexceptionaction',
            index=models.Index(fields=['snoozed_until'], name='dispatcher_e_snoozed_0e5122_idx'),
        ),
        migrations.AddIndex(
            model_name='dispatcherexceptionaction',
            index=models.Index(fields=['acknowledged_at'], name='dispatcher_e_acknowl_35a06e_idx'),
        ),
    ]
