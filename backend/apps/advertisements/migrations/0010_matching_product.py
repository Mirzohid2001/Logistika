from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('locations', '0002_seed_default_locations'),
        ('advertisements', '0009_saved_search_alerts_route_stops'),
    ]

    operations = [
        migrations.AddField(
            model_name='advertisement',
            name='required_body_type',
            field=models.CharField(blank=True, default='', max_length=20),
        ),
        migrations.AddField(
            model_name='advertisement',
            name='requires_adr',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='advertisement',
            name='requires_reefer',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='advertisement',
            name='is_heavy',
            field=models.BooleanField(default=False),
        ),
        migrations.CreateModel(
            name='DriverAvailability',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('status', models.CharField(choices=[('available', 'Available'), ('busy', 'Busy'), ('scheduled', 'Scheduled')], default='available', max_length=20)),
                ('available_from', models.DateTimeField(blank=True, null=True)),
                ('note', models.CharField(blank=True, default='', max_length=255)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('current_city', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='driver_availability', to='locations.city')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='driver_availability', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'driver_availability',
            },
        ),
        migrations.CreateModel(
            name='DriverLane',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weekdays', models.JSONField(blank=True, default=list)),
                ('include_backhaul', models.BooleanField(default=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('departure_city', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='driver_lanes_departure', to='locations.city')),
                ('destination_city', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='driver_lanes_destination', to='locations.city')),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='driver_lanes', to=settings.AUTH_USER_MODEL)),
            ],
            options={
                'db_table': 'driver_lanes',
                'ordering': ['-updated_at'],
            },
        ),
        migrations.AddIndex(
            model_name='driverlane',
            index=models.Index(fields=['user', 'is_active'], name='driver_lane_user_id_is_act_idx'),
        ),
    ]
