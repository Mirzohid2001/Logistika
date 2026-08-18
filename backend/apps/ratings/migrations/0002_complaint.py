import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('orders', '0011_order_offline_payment_flag'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('ratings', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='Complaint',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('category', models.CharField(choices=[('payment', 'Payment dispute'), ('behavior', 'Behavior'), ('cargo_damage', 'Cargo damage'), ('communication', 'Communication'), ('other', 'Other')], default='other', max_length=30)),
                ('description', models.TextField()),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('in_review', 'In review'), ('resolved', 'Resolved'), ('dismissed', 'Dismissed')], default='pending', max_length=20)),
                ('admin_notes', models.TextField(blank=True, default='')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('from_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='complaints_filed', to=settings.AUTH_USER_MODEL)),
                ('order', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='complaints', to='orders.order')),
                ('to_user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='complaints_received', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'complaints',
                'ordering': ['-created_at'],
                'indexes': [
                    models.Index(fields=['to_user', 'status'], name='complaints_to_user_8b0f0d_idx'),
                    models.Index(fields=['from_user', 'created_at'], name='complaints_from_us_6a8c2e_idx'),
                ],
            },
        ),
    ]
