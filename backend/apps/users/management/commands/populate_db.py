from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from apps.locations.models import Country, City
from apps.orders.models import OrderStatus, Order
from apps.advertisements.models import Advertisement
from apps.vehicles.models import Vehicle
from apps.bids.models import Bid
from apps.news.models import News
from apps.content.models import StaticContent
from apps.chats.models import Chat, Message
from apps.payments.models import Payment, PaymentHistory
from decimal import Decimal
from datetime import datetime, timedelta
import random

User = get_user_model()


class Command(BaseCommand):
    help = 'Заполняет базу данных тестовыми данными'

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS('Начинаем заполнение базы данных...'))

        # 1. Создаем страны и города
        self.create_locations()

        # 2. Создаем статусы заказов
        self.create_order_statuses()

        # 3. Создаем пользователей
        clients = self.create_clients()
        drivers = self.create_drivers()

        # 4. Создаем транспортные средства
        self.create_vehicles(drivers)

        # 5. Создаем объявления
        advertisements = self.create_advertisements(clients)

        # 6. Создаем предложения (bids)
        self.create_bids(advertisements, drivers, clients)

        # 7. Создаем заказы
        orders = self.create_orders(advertisements, drivers, clients)

        # 8. Создаем чаты и сообщения
        self.create_chats_and_messages(orders)

        # 9. Создаем платежи
        self.create_payments(orders, clients)

        # 10. Создаем новости
        self.create_news()

        # 11. Создаем статический контент
        self.create_static_content()

        self.stdout.write(self.style.SUCCESS('База данных успешно заполнена!'))

    def create_locations(self):
        self.stdout.write('Создаем страны и города...')

        # Узбекистан
        uz, created = Country.objects.get_or_create(
            code='UZ',
            defaults={
                'name_ru': 'Узбекистан',
                'name_en': 'Uzbekistan',
                'name_uz': "O'zbekiston"
            }
        )
        if created:
            self.stdout.write(f'  Создана страна: {uz.name_ru}')

        cities_uz = [
            ('Ташкент', 'Tashkent', 'Toshkent'),
            ('Самарканд', 'Samarkand', 'Samarqand'),
            ('Бухара', 'Bukhara', 'Buxoro'),
            ('Андижан', 'Andijan', 'Andijon'),
            ('Наманган', 'Namangan', 'Namangan'),
            ('Фергана', 'Fergana', 'Farg\'ona'),
        ]
        for name_ru, name_en, name_uz in cities_uz:
            city, created = City.objects.get_or_create(
                country=uz,
                name_ru=name_ru,
                defaults={
                    'name_en': name_en,
                    'name_uz': name_uz
                }
            )
            if created:
                self.stdout.write(f'  Создан город: {city.name_ru}')

        # Россия
        ru, created = Country.objects.get_or_create(
            code='RU',
            defaults={
                'name_ru': 'Россия',
                'name_en': 'Russia',
                'name_uz': 'Rossiya'
            }
        )
        if created:
            self.stdout.write(f'  Создана страна: {ru.name_ru}')

        cities_ru = [
            ('Москва', 'Moscow', 'Moskva'),
            ('Санкт-Петербург', 'Saint Petersburg', 'Sankt-Peterburg'),
            ('Казань', 'Kazan', 'Kazan'),
        ]
        for name_ru, name_en, name_uz in cities_ru:
            city, created = City.objects.get_or_create(
                country=ru,
                name_ru=name_ru,
                defaults={
                    'name_en': name_en,
                    'name_uz': name_uz
                }
            )
            if created:
                self.stdout.write(f'  Создан город: {city.name_ru}')

        # Казахстан
        kz, created = Country.objects.get_or_create(
            code='KZ',
            defaults={
                'name_ru': 'Казахстан',
                'name_en': 'Kazakhstan',
                'name_uz': 'Qozog\'iston'
            }
        )
        if created:
            self.stdout.write(f'  Создана страна: {kz.name_ru}')

        cities_kz = [
            ('Алматы', 'Almaty', 'Olmaota'),
            ('Астана', 'Astana', 'Astana'),
            ('Шымкент', 'Shymkent', 'Shimkent'),
        ]
        for name_ru, name_en, name_uz in cities_kz:
            city, created = City.objects.get_or_create(
                country=kz,
                name_ru=name_ru,
                defaults={
                    'name_en': name_en,
                    'name_uz': name_uz
                }
            )
            if created:
                self.stdout.write(f'  Создан город: {city.name_ru}')

    def create_order_statuses(self):
        self.stdout.write('Создаем статусы заказов...')

        statuses = [
            ('Новый', 'New', 'Yangi', 'new'),
            ('Ожидание', 'Pending', 'Kutilmoqda', 'pending'),
            ('В работе', 'In Progress', 'Ish jarayonida', 'in_progress'),
            ('В пути', 'In Transit', 'Yo\'lda', 'in_transit'),
            ('Завершен', 'Completed', 'Yakunlangan', 'completed'),
            ('Отменен', 'Cancelled', 'Bekor qilingan', 'cancelled'),
        ]

        for name_ru, name_en, name_uz, code in statuses:
            status, created = OrderStatus.objects.get_or_create(
                code=code,
                defaults={
                    'name_ru': name_ru,
                    'name_en': name_en,
                    'name_uz': name_uz
                }
            )
            if created:
                self.stdout.write(f'  Создан статус: {status.name_ru}')

    def create_clients(self):
        self.stdout.write('Создаем клиентов...')

        clients_data = [
            ('998901234567', 'Алишер', 'Усманов', 'alisher@example.com'),
            ('998901234568', 'Дильшода', 'Рахимова', 'dilshoda@example.com'),
            ('998901234569', 'Сардор', 'Ахмедов', 'sardor@example.com'),
            ('998901234570', 'Нигора', 'Каримова', 'nigora@example.com'),
            ('998901234571', 'Бахтиёр', 'Турсунов', 'bahtiyor@example.com'),
        ]

        clients = []
        for phone, first_name, last_name, email in clients_data:
            user, created = User.objects.get_or_create(
                phone=phone,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email,
                    'is_driver': False,
                    'is_client': True,
                }
            )
            if created:
                user.set_password('password123')
                user.save()
                self.stdout.write(f'  Создан клиент: {user.first_name} {user.last_name}')
            clients.append(user)

        return clients

    def create_drivers(self):
        self.stdout.write('Создаем водителей...')

        drivers_data = [
            ('998902234567', 'Акмал', 'Хасанов', 'akmal@example.com'),
            ('998902234568', 'Равшан', 'Ибрагимов', 'ravshan@example.com'),
            ('998902234569', 'Фарход', 'Алиев', 'farhod@example.com'),
            ('998902234570', 'Шухрат', 'Маматов', 'shuhrat@example.com'),
            ('998902234571', 'Джахонгир', 'Саидов', 'jahongir@example.com'),
        ]

        drivers = []
        for phone, first_name, last_name, email in drivers_data:
            user, created = User.objects.get_or_create(
                phone=phone,
                defaults={
                    'first_name': first_name,
                    'last_name': last_name,
                    'email': email,
                    'is_driver': True,
                    'is_client': False,
                    'is_verified': True,
                    'document_photos': ['passport.jpg', 'license.jpg'],
                }
            )
            if created:
                user.set_password('password123')
                user.save()
                self.stdout.write(f'  Создан водитель: {user.first_name} {user.last_name}')
            drivers.append(user)

        return drivers

    def create_vehicles(self, drivers):
        self.stdout.write('Создаем транспортные средства...')

        vehicles_data = [
            ('Mercedes-Benz', 'Sprinter', '01A123AA', 20.0, 3500.0),
            ('Ford', 'Transit', '02B456BB', 15.0, 2500.0),
            ('Volkswagen', 'Crafter', '03C789CC', 18.0, 3000.0),
            ('GAZ', 'Газель', '04D012DD', 12.0, 2000.0),
            ('Isuzu', 'NPR', '05E345EE', 25.0, 4000.0),
        ]

        for i, (make, model, number, volume, capacity) in enumerate(vehicles_data):
            if i < len(drivers):
                vehicle, created = Vehicle.objects.get_or_create(
                    number=number,
                    defaults={
                        'user': drivers[i],
                        'make': make,
                        'model': model,
                        'cargo_volume': Decimal(str(volume)),
                        'load_capacity': Decimal(str(capacity)),
                        'is_verified': True,
                    }
                )
                if created:
                    self.stdout.write(f'  Создано ТС: {vehicle.make} {vehicle.model} ({vehicle.number})')

    def create_advertisements(self, clients):
        self.stdout.write('Создаем объявления...')

        countries = Country.objects.all()
        cities = City.objects.all()

        if not countries.exists() or not cities.exists():
            self.stdout.write(self.style.WARNING('Нет стран или городов! Сначала создайте локации.'))
            return []

        advertisements_data = [
            {
                'title_ru': 'Перевозка мебели из Ташкента в Самарканд',
                'title_en': 'Furniture transportation from Tashkent to Samarkand',
                'title_uz': 'Toshkentdan Samarqandga mebel tashish',
                'description_ru': 'Нужно перевезти диван и два кресла. Аккуратная упаковка обязательна.',
                'description_en': 'Need to transport a sofa and two armchairs. Careful packaging required.',
                'description_uz': 'Divan va ikki kreslo tashish kerak. Ehtiyotkorlik bilan o\'rash kerak.',
                'weight': 150.0,
                'proposed_cost': 500000,
            },
            {
                'title_ru': 'Доставка товаров из Москвы в Ташкент',
                'title_en': 'Goods delivery from Moscow to Tashkent',
                'title_uz': 'Moskvadan Toshkentga tovarlar yetkazib berish',
                'description_ru': 'Коммерческий груз, 50 коробок электроники. Требуется документы.',
                'description_en': 'Commercial cargo, 50 boxes of electronics. Documents required.',
                'description_uz': 'Savdo yuki, 50 ta elektronika qutisi. Hujjatlar talab qilinadi.',
                'weight': 500.0,
                'proposed_cost': 2000000,
            },
            {
                'title_ru': 'Перевозка строительных материалов',
                'title_en': 'Construction materials transportation',
                'title_uz': 'Qurilish materiallarini tashish',
                'description_ru': 'Цемент, кирпич и арматура. Всего около 3 тонн.',
                'description_en': 'Cement, bricks and rebar. Total about 3 tons.',
                'description_uz': 'Sement, g\'isht va armatura. Jami taxminan 3 tonna.',
                'weight': 3000.0,
                'proposed_cost': 800000,
            },
            {
                'title_ru': 'Доставка продуктов из Алматы',
                'title_en': 'Food products delivery from Almaty',
                'title_uz': 'Olmaotadan oziq-ovqat mahsulotlarini yetkazib berish',
                'description_ru': 'Охлажденные продукты, требуется рефрижератор.',
                'description_en': 'Refrigerated products, refrigerator required.',
                'description_uz': 'Sovutilgan mahsulotlar, refrijerator talab qilinadi.',
                'weight': 800.0,
                'proposed_cost': 1500000,
            },
            {
                'title_ru': 'Перевозка личных вещей',
                'title_en': 'Personal belongings transportation',
                'title_uz': 'Shaxsiy buyumlarni tashish',
                'description_ru': 'Коробки с одеждой и бытовой техникой. Бережная перевозка.',
                'description_en': 'Boxes with clothes and household appliances. Careful transportation.',
                'description_uz': 'Kiyim va maishiy texnika bilan qutilar. Ehtiyotkorlik bilan tashish.',
                'weight': 400.0,
                'proposed_cost': 600000,
            },
        ]

        advertisements = []
        tashkent = City.objects.filter(name_ru='Ташкент').first()
        samarkand = City.objects.filter(name_ru='Самарканд').first()
        moscow = City.objects.filter(name_ru='Москва').first()
        almaty = City.objects.filter(name_ru='Алматы').first()

        departure_cities = [tashkent, moscow, tashkent, almaty, tashkent]
        destination_cities = [samarkand, tashkent, samarkand, tashkent, samarkand]

        for i, ad_data in enumerate(advertisements_data):
            if i < len(clients):
                client = clients[i]
                dep_city = departure_cities[i] if departure_cities[i] else cities.first()
                dest_city = destination_cities[i] if destination_cities[i] else cities.last()

                ad = Advertisement.objects.create(
                    client=client,
                    title_ru=ad_data['title_ru'],
                    title_en=ad_data['title_en'],
                    title_uz=ad_data['title_uz'],
                    description_ru=ad_data['description_ru'],
                    description_en=ad_data['description_en'],
                    description_uz=ad_data['description_uz'],
                    weight=Decimal(str(ad_data['weight'])),
                    proposed_cost=Decimal(str(ad_data['proposed_cost'])) if ad_data['proposed_cost'] else None,
                    departure_address=f'Адрес отправления {i+1}',
                    departure_city=dep_city,
                    destination_address=f'Адрес назначения {i+1}',
                    destination_city=dest_city,
                    is_closed=False,
                )
                advertisements.append(ad)
                self.stdout.write(f'  Создано объявление: {ad.title_ru}')

        return advertisements

    def create_bids(self, advertisements, drivers, clients):
        self.stdout.write('Создаем предложения...')

        if not advertisements or not drivers:
            return

        for ad in advertisements[:3]:  # Первые 3 объявления
            for driver in drivers[:2]:  # Первые 2 водителя
                # Создаем предложение с начальной ценой
                proposed_amount = float(ad.proposed_cost or 500000) * (0.9 + random.random() * 0.2)
                
                bid, created = Bid.objects.get_or_create(
                    advertisement=ad,
                    driver=driver,
                    client=ad.client,
                    defaults={
                        'proposed_amounts': [
                            {
                                'amount': str(int(proposed_amount)),
                                'by': 'driver',
                                'timestamp': timezone.now().isoformat()
                            }
                        ],
                        'last_counter_by': 'driver',
                    }
                )
                if created:
                    self.stdout.write(f'  Создано предложение от {driver.first_name} для объявления "{ad.title_ru[:30]}..."')

    def create_orders(self, advertisements, drivers, clients):
        self.stdout.write('Создаем заказы...')

        if not advertisements or not drivers:
            return []

        status_new = OrderStatus.objects.filter(code='new').first()
        status_in_progress = OrderStatus.objects.filter(code='in_progress').first()
        status_completed = OrderStatus.objects.filter(code='completed').first()

        if not status_new:
            return []

        orders = []
        # Создаем несколько заказов с разными статусами
        for i, ad in enumerate(advertisements[:3]):
            driver = drivers[i % len(drivers)]
            client = ad.client

            if i == 0 and status_in_progress:
                status = status_in_progress
            elif i == 1 and status_completed:
                status = status_completed
            else:
                status = status_new

            order = Order.objects.create(
                advertisement=ad,
                driver=driver,
                client=client,
                status=status,
                current_location_lat=Decimal('41.3111') + Decimal(str(random.uniform(-0.1, 0.1))),
                current_location_lng=Decimal('69.2797') + Decimal(str(random.uniform(-0.1, 0.1))),
            )

            if status.code == 'completed':
                order.completed_at = timezone.now() - timedelta(days=random.randint(1, 7))
                order.save()

            self.stdout.write(f'  Создан заказ #{order.id} со статусом "{status.name_ru}"')
            orders.append(order)
        return orders

    def create_chats_and_messages(self, orders):
        self.stdout.write('Создаем чаты и сообщения...')
        for order in orders:
            chat, _ = Chat.objects.get_or_create(
                order=order,
                client=order.client,
                driver=order.driver,
            )
            Message.objects.create(chat=chat, sender=order.client, text='Salom, buyurtma holati qanday?')
            Message.objects.create(chat=chat, sender=order.driver, text='Yo`ldaman, ETA 35 daqiqa.')
            Message.objects.create(chat=chat, sender=order.client, text='Rahmat!')

    def create_payments(self, orders, clients):
        self.stdout.write('Создаем платежи...')
        methods = ['click', 'payme', 'uzum']
        for i, order in enumerate(orders):
            amount = order.advertisement.proposed_cost or Decimal('500000')
            payer = clients[i % len(clients)] if clients else order.client
            payment, created = Payment.objects.get_or_create(
                order=order,
                user=payer,
                amount=amount,
                payment_method=methods[i % len(methods)],
                defaults={
                    'payment_status': 'completed' if i % 2 == 0 else 'pending',
                    'transaction_id': f'DEMO-TXN-{order.id}-{i}',
                    'paid_at': timezone.now() if i % 2 == 0 else None,
                }
            )
            if created:
                PaymentHistory.objects.create(
                    payment=payment,
                    status='pending',
                    status_new=payment.payment_status,
                    gateway_response={'seed': True}
                )

    def create_news(self):
        self.stdout.write('Создаем новости...')

        news_data = [
            {
                'title_ru': 'Новая система отслеживания грузов',
                'title_en': 'New cargo tracking system',
                'title_uz': 'Yangi yuk kuzatish tizimi',
                'text_ru': 'Мы запустили новую систему отслеживания грузов в реальном времени. Теперь вы можете видеть местоположение вашего груза в любой момент.',
                'text_en': 'We launched a new real-time cargo tracking system. Now you can see the location of your cargo at any time.',
                'text_uz': 'Biz real vaqtda yuk kuzatish tizimini ishga tushirdik. Endi siz yukingizning joylashuvini istalgan vaqtda ko\'rishingiz mumkin.',
                'date': timezone.now().date() - timedelta(days=5),
            },
            {
                'title_ru': 'Скидка 10% для новых пользователей',
                'title_en': '10% discount for new users',
                'title_uz': 'Yangi foydalanuvchilar uchun 10% chegirma',
                'text_ru': 'Зарегистрируйтесь до конца месяца и получите скидку 10% на первую перевозку!',
                'text_en': 'Register before the end of the month and get a 10% discount on your first shipment!',
                'text_uz': 'Oyning oxirigacha ro\'yxatdan o\'ting va birinchi tashish uchun 10% chegirma oling!',
                'date': timezone.now().date() - timedelta(days=2),
            },
            {
                'title_ru': 'Расширение географии доставки',
                'title_en': 'Expansion of delivery geography',
                'title_uz': 'Yetkazib berish geografiyasini kengaytirish',
                'text_ru': 'Теперь мы доставляем грузы в Казахстан и Россию!',
                'text_en': 'Now we deliver cargo to Kazakhstan and Russia!',
                'text_uz': 'Endi biz Qozog\'iston va Rossiyaga yuklarni yetkazib beramiz!',
                'date': timezone.now().date() - timedelta(days=1),
            },
        ]

        for news_item in news_data:
            news, created = News.objects.get_or_create(
                title_ru=news_item['title_ru'],
                defaults={
                    'title_en': news_item['title_en'],
                    'title_uz': news_item['title_uz'],
                    'text_ru': news_item['text_ru'],
                    'text_en': news_item['text_en'],
                    'text_uz': news_item['text_uz'],
                    'date': news_item['date'],
                }
            )
            if created:
                self.stdout.write(f'  Создана новость: {news.title_ru}')

    def create_static_content(self):
        self.stdout.write('Создаем статический контент...')

        content_data = [
            {
                'content_type': 'public_offer',
                'content_ru': 'ОБЩЕСТВЕННАЯ ОФЕРТА\n\nНастоящая публичная оферта определяет условия использования сервиса доставки грузов...',
                'content_en': 'PUBLIC OFFER\n\nThis public offer defines the terms of use of the cargo delivery service...',
                'content_uz': 'OMMAVIY OFERTA\n\nUshbu ommaviy oferta yuk tashish xizmatidan foydalanish shartlarini belgilaydi...',
            },
            {
                'content_type': 'disclaimer',
                'content_ru': 'ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ\n\nСервис предоставляется "как есть" без каких-либо гарантий...',
                'content_en': 'DISCLAIMER\n\nThe service is provided "as is" without any warranties...',
                'content_uz': 'DISCLAIMER\n\nXizmat "boricha" shaklida, hech qanday kafolatlarisiz taqdim etiladi...',
            },
            {
                'content_type': 'guide_clients',
                'content_ru': 'РУКОВОДСТВО ДЛЯ КЛИЕНТОВ\n\n1. Создайте объявление о перевозке\n2. Дождитесь предложений от водителей\n3. Выберите подходящее предложение\n4. Следите за доставкой в реальном времени',
                'content_en': 'GUIDE FOR CLIENTS\n\n1. Create a shipping advertisement\n2. Wait for offers from drivers\n3. Choose a suitable offer\n4. Track delivery in real time',
                'content_uz': 'MIJOZLAR UCHUN QO\'LLANMA\n\n1. Tashish e\'lonini yarating\n2. Haydovchilardan takliflarni kuting\n3. Mos taklifni tanlang\n4. Yetkazib berishni real vaqtda kuzating',
            },
            {
                'content_type': 'guide_drivers',
                'content_ru': 'РУКОВОДСТВО ДЛЯ ВОДИТЕЛЕЙ\n\n1. Зарегистрируйтесь как водитель\n2. Добавьте транспортное средство\n3. Просматривайте доступные заказы\n4. Делайте предложения клиентам\n5. Выполняйте заказы и получайте оплату',
                'content_en': 'GUIDE FOR DRIVERS\n\n1. Register as a driver\n2. Add a vehicle\n3. View available orders\n4. Make offers to clients\n5. Complete orders and receive payment',
                'content_uz': 'HAYDOVCHILAR UCHUN QO\'LLANMA\n\n1. Haydovchi sifatida ro\'yxatdan o\'ting\n2. Transport vositasini qo\'shing\n3. Mavjud buyurtmalarni ko\'ring\n4. Mijozlarga takliflar bering\n5. Buyurtmalarni bajarib, to\'lov oling',
            },
        ]

        for content_item in content_data:
            content, created = StaticContent.objects.get_or_create(
                content_type=content_item['content_type'],
                defaults={
                    'content_ru': content_item['content_ru'],
                    'content_en': content_item['content_en'],
                    'content_uz': content_item['content_uz'],
                }
            )
            if created:
                self.stdout.write(f'  Создан контент: {content.get_content_type_display()}')
