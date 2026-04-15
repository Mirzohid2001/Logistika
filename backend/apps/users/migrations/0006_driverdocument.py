from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0005_user_users_phone_af6883_idx_and_more'),
        ('vehicles', '0001_initial'),
    ]

    operations = [
        migrations.CreateModel(
            name='DriverDocument',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('document_type', models.CharField(choices=[('passport', 'Passport'), ('driver_license', 'Driver License'), ('vehicle_insurance', 'Vehicle Insurance'), ('tech_inspection', 'Technical Inspection'), ('permit', 'Permit')], max_length=50)),
                ('document_number', models.CharField(blank=True, default='', max_length=120)),
                ('issued_at', models.DateField(blank=True, null=True)),
                ('expires_at', models.DateField()),
                ('reminder_sent_at', models.DateTimeField(blank=True, null=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('user', models.ForeignKey(limit_choices_to={'is_driver': True}, on_delete=django.db.models.deletion.CASCADE, related_name='driver_documents', to='users.user')),
                ('vehicle', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='documents', to='vehicles.vehicle')),
            ],
            options={
                'verbose_name': 'Driver Document',
                'verbose_name_plural': 'Driver Documents',
                'db_table': 'driver_documents',
                'ordering': ['expires_at'],
            },
        ),
        migrations.AddIndex(
            model_name='driverdocument',
            index=models.Index(fields=['user', 'document_type'], name='driver_docum_user_id_83fefd_idx'),
        ),
        migrations.AddIndex(
            model_name='driverdocument',
            index=models.Index(fields=['expires_at'], name='driver_docum_expires_16d92c_idx'),
        ),
        migrations.AddIndex(
            model_name='driverdocument',
            index=models.Index(fields=['is_active'], name='driver_docum_is_acti_f7f5f5_idx'),
        ),
    ]
