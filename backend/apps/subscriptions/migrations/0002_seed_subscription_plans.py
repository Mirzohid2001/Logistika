from django.db import migrations


def seed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    plans = [
        {
            'code': 'client_monthly',
            'audience': 'client',
            'name_ru': 'Клиент — месяц',
            'name_uz': 'Mijoz — oylik',
            'name_en': 'Client — monthly',
            'description_ru': 'Размещение грузов, заявки, отслеживание и оплата заказов.',
            'description_uz': 'Yuk e\'lonlari, takliflar, kuzatuv va to\'lovlar.',
            'description_en': 'Post loads, bids, tracking and payments.',
            'price': 99000,
            'duration_days': 30,
            'sort_order': 1,
        },
        {
            'code': 'driver_monthly',
            'audience': 'driver',
            'name_ru': 'Водитель — месяц',
            'name_uz': 'Haydovchi — oylik',
            'name_en': 'Driver — monthly',
            'description_ru': 'Поиск грузов, ставки, навигация и выполнение заказов.',
            'description_uz': 'Yuk qidirish, takliflar, navigatsiya va buyurtmalar.',
            'description_en': 'Find loads, bids, navigation and orders.',
            'price': 149000,
            'duration_days': 30,
            'sort_order': 1,
        },
    ]
    for item in plans:
        SubscriptionPlan.objects.update_or_create(code=item['code'], defaults=item)


def unseed_plans(apps, schema_editor):
    SubscriptionPlan = apps.get_model('subscriptions', 'SubscriptionPlan')
    SubscriptionPlan.objects.filter(code__in=['client_monthly', 'driver_monthly']).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('subscriptions', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed_plans, unseed_plans),
    ]
