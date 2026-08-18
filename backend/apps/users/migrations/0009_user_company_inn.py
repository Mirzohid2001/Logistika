from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('users', '0008_normalize_marketplace_roles'),
    ]

    operations = [
        migrations.AddField(
            model_name='user',
            name='company_inn',
            field=models.CharField(
                blank=True,
                db_index=True,
                help_text='Korxona STIR (INN) — faqat mijozlar uchun',
                max_length=9,
                null=True,
                unique=True,
            ),
        ),
    ]
