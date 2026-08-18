from django.db import migrations, models


def forwards(apps, schema_editor):
    User = apps.get_model('users', 'User')
    for user in User.objects.filter(is_driver=True).iterator():
        if user.is_verified:
            status = 'approved'
        elif user.document_photos:
            status = 'pending'
        else:
            status = 'not_submitted'
        User.objects.filter(pk=user.pk).update(verification_status=status)


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0009_user_company_inn'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='verification_status',
            field=models.CharField(
                choices=[
                    ('not_submitted', 'Not submitted'),
                    ('pending', 'Pending review'),
                    ('approved', 'Approved'),
                    ('rejected', 'Rejected'),
                ],
                default='not_submitted',
                max_length=20,
            ),
        ),
        migrations.RunPython(forwards, migrations.RunPython.noop),
        migrations.AddIndex(
            model_name='user',
            index=models.Index(fields=['is_driver', 'verification_status'], name='users_driver_verif_idx'),
        ),
    ]
