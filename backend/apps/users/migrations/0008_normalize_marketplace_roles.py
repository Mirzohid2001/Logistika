from django.db import migrations


def normalize_dual_roles(apps, schema_editor):
    User = apps.get_model('users', 'User')
    User.objects.filter(is_driver=True, is_client=True).update(is_client=False)


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0007_rename_driver_docum_user_id_83fefd_idx_driver_docu_user_id_0335c7_idx_and_more'),
    ]

    operations = [
        migrations.RunPython(normalize_dual_roles, noop),
    ]
