from django.db import migrations


def seed_default_static_content(apps, schema_editor):
    StaticContent = apps.get_model('content', 'StaticContent')
    from apps.content.seed_data import DEFAULT_STATIC_CONTENT

    for item in DEFAULT_STATIC_CONTENT:
        StaticContent.objects.get_or_create(
            content_type=item['content_type'],
            defaults={
                'content_uz': item['content_uz'],
                'content_ru': item['content_ru'],
                'content_en': item['content_en'],
            },
        )


class Migration(migrations.Migration):
    dependencies = [
        ('content', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_default_static_content, migrations.RunPython.noop),
    ]
