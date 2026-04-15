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
            name='DispatcherAssignment',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('assigned_at', models.DateTimeField(auto_now_add=True)),
                ('reassigned_at', models.DateTimeField(blank=True, null=True)),
                ('status', models.CharField(choices=[('assigned', 'Tayinlangan'), ('reassigned', 'Qayta tayinlangan'), ('cancelled', 'Bekor qilingan'), ('completed', 'Yakunlangan')], default='assigned', max_length=20)),
                ('notes', models.TextField(blank=True, null=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('assigned_driver', models.ForeignKey(blank=True, limit_choices_to={'is_driver': True}, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='assigned_orders', to='users.user')),
                ('dispatcher', models.ForeignKey(limit_choices_to={'is_dispatcher': True}, on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_assignments', to='users.user')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_assignments', to='orders.order')),
            ],
            options={
                'verbose_name': 'Dispatcher Assignment',
                'verbose_name_plural': 'Dispatcher Assignments',
                'db_table': 'dispatcher_assignments',
                'ordering': ['-assigned_at'],
            },
        ),
        migrations.CreateModel(
            name='DispatcherNote',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('note', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('dispatcher', models.ForeignKey(limit_choices_to={'is_dispatcher': True}, on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_notes', to='users.user')),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='dispatcher_notes', to='orders.order')),
            ],
            options={
                'verbose_name': 'Dispatcher Note',
                'verbose_name_plural': 'Dispatcher Notes',
                'db_table': 'dispatcher_notes',
                'ordering': ['-created_at'],
            },
        ),
    ]
