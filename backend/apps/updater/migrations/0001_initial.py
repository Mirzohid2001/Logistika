# Generated manually

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ('users', '0001_initial'),
        ('orders', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='UpdateLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('update_type', models.CharField(choices=[('status', 'Status'), ('location', 'Location'), ('payment', 'Payment'), ('other', 'Other')], max_length=50)),
                ('old_value', models.JSONField(blank=True, null=True)),
                ('new_value', models.JSONField(blank=True, null=True)),
                ('description', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='update_logs', to='orders.order')),
                ('updater', models.ForeignKey(blank=True, limit_choices_to={'is_updater': True}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='update_logs', to='users.user')),
            ],
            options={
                'verbose_name': 'Update Log',
                'verbose_name_plural': 'Update Logs',
                'db_table': 'update_logs',
                'ordering': ['-created_at'],
            },
        ),
    ]
