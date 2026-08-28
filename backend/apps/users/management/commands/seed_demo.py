from datetime import timedelta
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageDraw, ImageFont

from apps.advertisements.models import (
    Advertisement,
    DriverAvailability,
    DriverLane,
    FavoriteAdvertisement,
    SavedSearch,
)
from apps.bids.models import Bid
from apps.chats.models import Chat, Message
from apps.content.models import StaticContent
from apps.dispatcher.models import DispatcherAssignment, DispatcherNote
from apps.locations.models import City, Country
from apps.news.models import News
from apps.notifications.models import Notification, UserNotificationSettings
from apps.orders.models import (
    Order,
    OrderLocationTrack,
    OrderProofOfDelivery,
    OrderRouteStop,
    OrderStatus,
)
from apps.payments.models import (
    OrderCompletionFee,
    OrderCompletionFeeSettings,
    Payment,
    PaymentHistory,
    Wallet,
)
from apps.ratings.models import Rating
from apps.subscriptions.models import MarketplaceTrialAccount, SubscriptionPlan, UserSubscription
from apps.updater.models import UpdateLog
from apps.users.models import Company, CompanyMember, DriverDocument
from apps.vehicles.models import Vehicle


User = get_user_model()

DEMO_PASSWORD = 'demo12345'
DEMO_USERS = {
    'admin': '+998901000100',
    'client': '+998901000101',
    'driver': '+998901000102',
    'dispatcher': '+998901000103',
    'updater': '+998901000104',
    'fee_client': '+998901000105',
    'fee_driver': '+998901000106',
}


class Command(BaseCommand):
    help = 'Create or reset deterministic demo fixtures for every application role.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--password',
            default=DEMO_PASSWORD,
            help='Password assigned to every demo account (default: demo12345).',
        )

    @transaction.atomic
    def handle(self, *args, **options):
        password = options['password']
        now = timezone.now()

        self.stdout.write('Creating deterministic Logistika demo fixtures...')
        demo_media = self._demo_media()
        cities = self._locations()
        statuses = self._statuses()
        users = self._users(password, demo_media)
        vehicles = self._vehicles_and_documents(users, now, demo_media)
        advertisements = self._advertisements(users, cities, now)
        orders = self._orders(users, advertisements, statuses, now)
        self._marketplace(users, advertisements, orders, cities, now)
        self._tracking(orders['active'], cities, now)
        self._chats(orders, now)
        self._payments(users, orders, now)
        self._operations(users, orders, now)
        self._subscriptions(users, now)
        self._content(now)

        self.stdout.write(self.style.SUCCESS('\nDemo fixtures are ready.'))
        self.stdout.write('API/mobile accounts (one password for all):')
        for role, phone in DEMO_USERS.items():
            self.stdout.write(f'  {role:12} {phone}')
        self.stdout.write(f'  password     {password}')
        self.stdout.write('Admin panel: use the admin phone and the same password.')
        self.stdout.write(
            f"Seeded: {len(users)} users, {len(vehicles)} vehicles, "
            f"{len(advertisements)} advertisements, {len(orders)} orders."
        )

    def _demo_media(self):
        media_dir = Path(settings.MEDIA_ROOT) / 'demo'
        media_dir.mkdir(parents=True, exist_ok=True)
        assets = {
            'driver_license': ('driver-license.png', 'DEMO DRIVER LICENSE', '#123B5D'),
            'vehicle_document': ('vehicle-document.png', 'DEMO VEHICLE DOCUMENT', '#176B68'),
            'vehicle_photo': ('vehicle.png', 'DEMO CARGO TRUCK', '#17242E'),
        }

        font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
        try:
            title_font = ImageFont.truetype(font_path, 44)
            detail_font = ImageFont.truetype(font_path, 26)
        except OSError:
            title_font = ImageFont.load_default()
            detail_font = ImageFont.load_default()

        result = {}
        for key, (filename, title, color) in assets.items():
            path = media_dir / filename
            image = Image.new('RGB', (960, 600), color)
            draw = ImageDraw.Draw(image)
            draw.rounded_rectangle((55, 55, 905, 545), radius=32, outline='#21C5C9', width=8)
            draw.text((90, 110), 'LOGISTIKA', fill='#21C5C9', font=detail_font)
            draw.text((90, 225), title, fill='white', font=title_font)
            draw.text((90, 330), 'LOCAL FIXTURE · NOT A REAL DOCUMENT', fill='#D8E3E8', font=detail_font)
            draw.text((90, 430), '+998 90 100 01 02', fill='#F4A95B', font=detail_font)
            image.save(path, format='PNG', optimize=True)
            result[key] = f'demo/{filename}'
        return result

    def _locations(self):
        countries = [
            ('UZ', 'Узбекистан', 'Uzbekistan', "O'zbekiston"),
            ('KZ', 'Казахстан', 'Kazakhstan', "Qozog'iston"),
            ('RU', 'Россия', 'Russia', 'Rossiya'),
        ]
        country_by_code = {}
        for code, name_ru, name_en, name_uz in countries:
            country, _ = Country.objects.update_or_create(
                code=code,
                defaults={'name_ru': name_ru, 'name_en': name_en, 'name_uz': name_uz},
            )
            country_by_code[code] = country

        rows = [
            ('UZ', 'Ташкент', 'Tashkent', 'Toshkent', '41.299496', '69.240073'),
            ('UZ', 'Самарканд', 'Samarkand', 'Samarqand', '39.654200', '66.959700'),
            ('UZ', 'Бухара', 'Bukhara', 'Buxoro', '39.768100', '64.455600'),
            ('UZ', 'Карши', 'Karshi', 'Qarshi', '38.860600', '65.789100'),
            ('KZ', 'Алматы', 'Almaty', 'Olmaota', '43.238949', '76.889709'),
            ('RU', 'Москва', 'Moscow', 'Moskva', '55.755826', '37.617300'),
        ]
        result = {}
        for code, name_ru, name_en, name_uz, lat, lng in rows:
            city, _ = City.objects.update_or_create(
                country=country_by_code[code],
                name_ru=name_ru,
                defaults={
                    'name_en': name_en,
                    'name_uz': name_uz,
                    'latitude': Decimal(lat),
                    'longitude': Decimal(lng),
                },
            )
            result[name_en.lower()] = city
        return result

    def _statuses(self):
        rows = [
            ('new', 'Новый', 'New', 'Yangi'),
            ('pending', 'Ожидает водителя', 'Pending', 'Haydovchi kutilmoqda'),
            ('in_progress', 'Погрузка', 'Loading', 'Yuklanmoqda'),
            ('in_transit', 'В пути', 'In transit', "Yo'lda"),
            ('completed', 'Завершён', 'Completed', 'Yakunlangan'),
            ('cancelled', 'Отменён', 'Cancelled', 'Bekor qilingan'),
        ]
        result = {}
        for code, name_ru, name_en, name_uz in rows:
            status, _ = OrderStatus.objects.update_or_create(
                code=code,
                defaults={'name_ru': name_ru, 'name_en': name_en, 'name_uz': name_uz},
            )
            result[code] = status
        return result

    def _users(self, password, demo_media):
        specs = {
            'admin': {
                'first_name': 'Demo', 'last_name': 'Admin', 'email': 'admin@demo.logistika.uz',
                'is_client': False, 'is_driver': False, 'is_admin': True,
                'is_staff': True, 'is_superuser': True, 'is_verified': True,
                'verification_status': 'approved',
            },
            'client': {
                'first_name': 'Aziz', 'last_name': 'Karimov', 'email': 'client@demo.logistika.uz',
                'is_client': True, 'is_driver': False, 'is_verified': True,
                'verification_status': 'approved', 'company_inn': '309876541',
            },
            'driver': {
                'first_name': 'Bekzod', 'last_name': 'Rasulov', 'email': 'driver@demo.logistika.uz',
                'is_client': False, 'is_driver': True, 'is_verified': True,
                'verification_status': 'approved', 'document_photos': [demo_media['driver_license']],
            },
            'dispatcher': {
                'first_name': 'Madina', 'last_name': 'Dispatcher', 'email': 'dispatcher@demo.logistika.uz',
                'is_client': False, 'is_driver': False, 'is_dispatcher': True,
                'is_verified': True, 'verification_status': 'approved', 'dispatcher_code': 'DEMO-DSP',
            },
            'updater': {
                'first_name': 'Timur', 'last_name': 'Updater', 'email': 'updater@demo.logistika.uz',
                'is_client': False, 'is_driver': False, 'is_updater': True,
                'is_verified': True, 'verification_status': 'approved', 'updater_code': 'DEMO-UPD',
            },
            'fee_client': {
                'first_name': 'Fee', 'last_name': 'Client', 'email': 'fee-client@demo.logistika.uz',
                'is_client': True, 'is_driver': False, 'is_verified': True,
                'verification_status': 'approved', 'company_inn': '309876542',
            },
            'fee_driver': {
                'first_name': 'Fee', 'last_name': 'Driver', 'email': 'fee-driver@demo.logistika.uz',
                'is_client': False, 'is_driver': True, 'is_verified': True,
                'verification_status': 'approved', 'document_photos': [demo_media['driver_license']],
            },
        }
        users = {}
        all_role_flags = {
            'is_admin': False,
            'is_operator': False,
            'is_dispatcher': False,
            'is_updater': False,
            'is_staff': False,
            'is_superuser': False,
            'is_blocked': False,
            'suspended_until': None,
        }
        for role, phone in DEMO_USERS.items():
            defaults = {**all_role_flags, **specs[role]}
            user, _ = User.objects.update_or_create(phone=phone, defaults=defaults)
            user.set_password(password)
            user.save(update_fields=['password', 'updated_at'])
            users[role] = user

        companies = [
            (users['client'], '309876541', 'Demo Cargo LLC'),
            (users['fee_client'], '309876542', 'Demo Fee Scenario LLC'),
        ]
        for user, inn, name in companies:
            company, _ = Company.objects.update_or_create(
                inn=inn,
                defaults={
                    'name': name,
                    'address': 'Toshkent shahri, Demo ko\'chasi 1',
                    'phone': user.phone,
                    'director_name': f'{user.first_name} {user.last_name}',
                    'bank_name': 'Demo Bank',
                    'bank_account': '20208000900000000001',
                    'mfo': '00001',
                    'oked': '49410',
                },
            )
            CompanyMember.objects.update_or_create(
                company=company,
                user=user,
                defaults={'role': CompanyMember.ROLE_ADMIN},
            )

        for user in users.values():
            UserNotificationSettings.objects.get_or_create(user=user)
            Wallet.objects.update_or_create(
                user=user,
                defaults={'available': Decimal('0'), 'held': Decimal('0')},
            )
        return users

    def _vehicles_and_documents(self, users, now, demo_media):
        specs = [
            (users['driver'], '01D777DA', 'Mercedes-Benz', 'Actros 1845', 'tent', '86', '20000'),
            (users['fee_driver'], '01F050EE', 'MAN', 'TGX 18.440', 'reefer', '82', '19500'),
        ]
        result = []
        for user, number, make, model, body_type, volume, capacity in specs:
            vehicle, _ = Vehicle.objects.update_or_create(
                number=number,
                defaults={
                    'user': user,
                    'make': make,
                    'model': model,
                    'cargo_volume': Decimal(volume),
                    'load_capacity': Decimal(capacity),
                    'body_type': body_type,
                    'is_reefer': body_type == 'reefer',
                    'photo': demo_media['vehicle_photo'],
                    'document_photos': [demo_media['vehicle_document']],
                    'is_verified': True,
                    'verification_status': 'approved',
                },
            )
            result.append(vehicle)
            for doc_type, suffix in [('driver_license', 'DL'), ('tech_inspection', 'TI')]:
                DriverDocument.objects.update_or_create(
                    user=user,
                    vehicle=vehicle,
                    document_type=doc_type,
                    defaults={
                        'document_number': f'DEMO-{suffix}-{user.id}',
                        'issued_at': now.date() - timedelta(days=180),
                        'expires_at': now.date() + timedelta(days=180),
                        'is_active': True,
                    },
                )
        return result

    def _advertisements(self, users, cities, now):
        base = {
            'description_en': 'Deterministic demo cargo for end-to-end testing.',
            'description_uz': "To'liq sinov uchun demo yuk.",
            'contact_name': 'Aziz Karimov',
            'contact_phone': users['client'].phone,
            'receiver_name': 'Demo Receiver',
            'receiver_phone': '+998901112233',
            'currency': 'UZS',
            'route_preference': 'balanced',
        }
        specs = {
            'available': {
                'client': users['client'],
                'title_ru': '[DEMO] Электроника Ташкент → Бухара',
                'title_en': '[DEMO] Electronics Tashkent → Bukhara',
                'title_uz': '[DEMO] Elektronika Toshkent → Buxoro',
                'description_ru': 'Паллеты с электроникой. Требуется тентованный грузовик.',
                'weight': Decimal('4200'), 'volume_m3': Decimal('34'),
                'departure_city': cities['tashkent'], 'departure_address': 'ул. Мукими, 10',
                'destination_city': cities['bukhara'], 'destination_address': 'ул. Б.Накшбанди, 7',
                'cargo_category': 'electronics', 'required_body_type': 'tent',
                'proposed_cost': Decimal('4800000'), 'is_closed': False,
                'pickup_window_start': now + timedelta(hours=4),
                'pickup_window_end': now + timedelta(hours=8),
                'delivery_deadline': now + timedelta(days=2),
            },
            'active': {
                'client': users['client'],
                'title_ru': '[DEMO] Текстиль Ташкент → Самарканд',
                'title_en': '[DEMO] Textile Tashkent → Samarkand',
                'title_uz': '[DEMO] Tekstil Toshkent → Samarqand',
                'description_ru': '18 паллет текстиля. Заказ находится в пути и имеет live-трек.',
                'weight': Decimal('8500'), 'volume_m3': Decimal('52'),
                'departure_city': cities['tashkent'], 'departure_address': 'Сергелийский район, склад 12',
                'destination_city': cities['samarkand'], 'destination_address': 'ул. Рудаки, 45',
                'cargo_category': 'general', 'required_body_type': 'tent',
                'proposed_cost': Decimal('6200000'), 'is_closed': True,
                'pickup_window_start': now - timedelta(hours=6),
                'pickup_window_end': now - timedelta(hours=4),
                'delivery_deadline': now + timedelta(hours=8),
            },
            'completed': {
                'client': users['client'],
                'title_ru': '[DEMO] Мебель Самарканд → Ташкент',
                'title_en': '[DEMO] Furniture Samarkand → Tashkent',
                'title_uz': '[DEMO] Mebel Samarqand → Toshkent',
                'description_ru': 'Завершённый заказ с оплатой, отзывом и закрытыми сервисными сборами.',
                'weight': Decimal('2100'), 'volume_m3': Decimal('28'),
                'departure_city': cities['samarkand'], 'departure_address': 'Склад Registon',
                'destination_city': cities['tashkent'], 'destination_address': 'Чиланзар, квартал 19',
                'cargo_category': 'furniture', 'proposed_cost': Decimal('3900000'), 'is_closed': True,
                'pickup_window_start': now - timedelta(days=5),
                'pickup_window_end': now - timedelta(days=5, hours=-2),
                'delivery_deadline': now - timedelta(days=4),
            },
            'fee_blocked': {
                'client': users['fee_client'],
                'title_ru': '[DEMO] Сценарий неоплаченного сбора',
                'title_en': '[DEMO] Unpaid service fee scenario',
                'title_uz': '[DEMO] To\'lanmagan xizmat haqi ssenariysi',
                'description_ru': 'Завершённый заказ: обе стороны должны оплатить сервисный сбор.',
                'weight': Decimal('5000'), 'volume_m3': Decimal('40'),
                'departure_city': cities['bukhara'], 'departure_address': 'Demo Bukhara warehouse',
                'destination_city': cities['tashkent'], 'destination_address': 'Demo Tashkent terminal',
                'cargo_category': 'general', 'proposed_cost': Decimal('5100000'), 'is_closed': True,
                'pickup_window_start': now - timedelta(days=3),
                'pickup_window_end': now - timedelta(days=3, hours=-2),
                'delivery_deadline': now - timedelta(days=2),
            },
        }
        result = {}
        for key, spec in specs.items():
            client = spec['client']
            title = spec['title_ru']
            defaults = {**base, **spec}
            defaults.pop('client')
            advertisement, _ = Advertisement.objects.update_or_create(
                client=client,
                title_ru=title,
                defaults=defaults,
            )
            result[key] = advertisement
        return result

    def _orders(self, users, advertisements, statuses, now):
        fee_settings, _ = OrderCompletionFeeSettings.objects.update_or_create(
            pk=1,
            defaults={
                'is_enabled': True,
                'client_fee_enabled': True,
                'driver_fee_enabled': True,
                'client_fee_amount': Decimal('50000'),
                'driver_fee_amount': Decimal('40000'),
                'currency': 'UZS',
            },
        )
        fee_settings.save()

        route = [
            {'lat': 41.299496, 'lng': 69.240073},
            {'lat': 40.852300, 'lng': 68.160400},
            {'lat': 40.115800, 'lng': 67.842200},
            {'lat': 39.654200, 'lng': 66.959700},
        ]
        specs = {
            'active': {
                'advertisement': advertisements['active'], 'driver': users['driver'],
                'client': users['client'], 'status': statuses['in_transit'],
                'agreed_amount': Decimal('6000000'), 'current_location_lat': Decimal('40.115800'),
                'current_location_lng': Decimal('67.842200'), 'current_speed_mps': 18.5,
                'current_heading': 238.0, 'planned_route_points': route,
                'optimized_route_polyline': route, 'optimized_route_distance_meters': 305000,
                'optimized_route_duration_seconds': 17400, 'route_optimization_provider': 'demo',
                'driver_last_seen_at': now, 'driver_app_state': 'foreground',
                'started_at': now - timedelta(hours=5), 'in_transit_at': now - timedelta(hours=4),
                'tracked_distance_meters': 184000, 'loaded_distance_meters': 184000,
                'tracked_distance_computed_at': now,
            },
            'completed': {
                'advertisement': advertisements['completed'], 'driver': users['driver'],
                'client': users['client'], 'status': statuses['completed'],
                'agreed_amount': Decimal('3800000'), 'current_location_lat': Decimal('41.299496'),
                'current_location_lng': Decimal('69.240073'), 'planned_route_points': list(reversed(route)),
                'started_at': now - timedelta(days=5), 'in_transit_at': now - timedelta(days=5, hours=-2),
                'completed_at': now - timedelta(days=4), 'client_paid_reported': True,
                'client_paid_reported_at': now - timedelta(days=4, minutes=20),
                'client_payment_confirmed': True,
                'client_payment_confirmed_at': now - timedelta(days=4, minutes=15),
                'client_delivery_confirmed': True,
                'client_delivery_confirmed_at': now - timedelta(days=4),
            },
            'fee_blocked': {
                'advertisement': advertisements['fee_blocked'], 'driver': users['fee_driver'],
                'client': users['fee_client'], 'status': statuses['completed'],
                'agreed_amount': Decimal('5000000'), 'current_location_lat': Decimal('41.299496'),
                'current_location_lng': Decimal('69.240073'), 'planned_route_points': route,
                'started_at': now - timedelta(days=3), 'in_transit_at': now - timedelta(days=3, hours=-2),
                'completed_at': now - timedelta(days=2), 'client_paid_reported': True,
                'client_paid_reported_at': now - timedelta(days=2, minutes=20),
                'client_payment_confirmed': True,
                'client_payment_confirmed_at': now - timedelta(days=2, minutes=15),
                'client_delivery_confirmed': True,
                'client_delivery_confirmed_at': now - timedelta(days=2),
            },
        }
        result = {}
        for key, defaults in specs.items():
            advertisement = defaults['advertisement']
            order, _ = Order.objects.update_or_create(
                advertisement=advertisement,
                defaults=defaults,
            )
            result[key] = order
        return result

    def _marketplace(self, users, advertisements, orders, cities, now):
        open_bid, _ = Bid.objects.update_or_create(
            advertisement=advertisements['available'],
            client=users['client'],
            driver=users['driver'],
            defaults={
                'proposed_amounts': [
                    {'amount': '4500000', 'by': 'driver', 'timestamp': (now - timedelta(minutes=40)).isoformat()},
                    {'amount': '4600000', 'by': 'client', 'timestamp': (now - timedelta(minutes=25)).isoformat()},
                ],
                'last_counter_by': 'client',
                'is_driver_agreed_to_amount': False,
                'is_rejected_by_client': False,
                'is_accepted_by_client': False,
                'is_rejected_by_driver': False,
            },
        )
        accepted_bid, _ = Bid.objects.update_or_create(
            advertisement=advertisements['active'],
            client=users['client'],
            driver=users['driver'],
            defaults={
                'proposed_amounts': [
                    {'amount': '6000000', 'by': 'driver', 'timestamp': (now - timedelta(hours=8)).isoformat()},
                ],
                'last_counter_by': 'driver',
                'is_driver_agreed_to_amount': True,
                'is_accepted_by_client': True,
                'is_rejected_by_client': False,
                'is_rejected_by_driver': False,
            },
        )
        active_order = orders['active']
        if active_order.source_bid_id != accepted_bid.id:
            active_order.source_bid = accepted_bid
            active_order.save(update_fields=['source_bid', 'updated_at'])

        FavoriteAdvertisement.objects.get_or_create(
            user=users['driver'], advertisement=advertisements['available']
        )
        SavedSearch.objects.update_or_create(
            user=users['driver'],
            name='[DEMO] Toshkentdan yuklar',
            defaults={
                'query': '',
                'departure_city': cities['tashkent'],
                'filters': {'required_body_type': 'tent'},
                'alerts_enabled': True,
            },
        )
        DriverAvailability.objects.update_or_create(
            user=users['driver'],
            defaults={
                'status': DriverAvailability.STATUS_BUSY,
                'available_from': now + timedelta(hours=10),
                'current_city': cities['samarkand'],
                'note': 'Demo active delivery',
            },
        )
        DriverLane.objects.update_or_create(
            user=users['driver'],
            departure_city=cities['tashkent'],
            destination_city=cities['samarkand'],
            defaults={'weekdays': [1, 3, 5], 'include_backhaul': True, 'is_active': True},
        )

        Notification.objects.update_or_create(
            user=users['client'],
            order=active_order,
            notification_type='order_in_transit',
            title='Груз в пути',
            defaults={
                'message': 'Водитель движется в Самарканд. Откройте карту для live-трекинга.',
                'is_read': False,
            },
        )
        Notification.objects.update_or_create(
            user=users['driver'],
            advertisement=advertisements['available'],
            notification_type='driver_load_offer',
            title='Подходящий груз',
            defaults={
                'message': 'Найден груз Ташкент → Бухара для вашего автомобиля.',
                'is_read': False,
            },
        )
        return open_bid

    def _tracking(self, order, cities, now):
        stops = [
            (1, 'pickup', 'Погрузка — Ташкент', 'Сергелийский район, склад 12', cities['tashkent'], 'completed'),
            (2, 'delivery', 'Выгрузка — Самарканд', 'ул. Рудаки, 45', cities['samarkand'], 'pending'),
        ]
        for sequence, stop_type, label, address, city, status in stops:
            OrderRouteStop.objects.update_or_create(
                order=order,
                sequence=sequence,
                defaults={
                    'stop_type': stop_type,
                    'label': label,
                    'address': address,
                    'lat': city.latitude,
                    'lng': city.longitude,
                    'status': status,
                    'arrived_at': now - timedelta(hours=5) if status == 'completed' else None,
                    'completed_at': now - timedelta(hours=4, minutes=40) if status == 'completed' else None,
                },
            )

        points = [
            ('41.299496', '69.240073'),
            ('41.127800', '68.987400'),
            ('40.951300', '68.676200'),
            ('40.742100', '68.390500'),
            ('40.535900', '68.204800'),
            ('40.331500', '68.052300'),
            ('40.115800', '67.842200'),
        ]
        order.location_tracks.all().delete()
        for index, (lat, lng) in enumerate(points):
            track = OrderLocationTrack.objects.create(order=order, lat=Decimal(lat), lng=Decimal(lng))
            OrderLocationTrack.objects.filter(pk=track.pk).update(
                timestamp=now - timedelta(minutes=(len(points) - index - 1) * 12)
            )

    def _chats(self, orders, now):
        for order_key in ('active', 'completed'):
            order = orders[order_key]
            chat, _ = Chat.objects.get_or_create(order=order, client=order.client, driver=order.driver)
            rows = [
                (order.client, 'Здравствуйте! Погрузка прошла без проблем?'),
                (order.driver, 'Да, всё загружено. Я уже в пути.'),
                (order.client, 'Спасибо. Буду следить за доставкой на карте.'),
            ]
            for index, (sender, message_text) in enumerate(rows):
                message, _ = Message.objects.update_or_create(
                    chat=chat,
                    sender=sender,
                    text=message_text,
                    defaults={'message_type': Message.MESSAGE_TYPE_TEXT, 'is_read': index < 2},
                )
                Message.objects.filter(pk=message.pk).update(
                    created_at=now - timedelta(minutes=(len(rows) - index) * 7)
                )

    def _payments(self, users, orders, now):
        completed_order = orders['completed']
        cargo_payment, _ = Payment.objects.update_or_create(
            transaction_id='DEMO-CARGO-PAID-001',
            defaults={
                'user': users['client'], 'order': completed_order, 'completion_fee': None,
                'amount': completed_order.agreed_amount, 'currency': 'UZS',
                'payment_method': 'mock', 'payment_status': 'completed',
                'gateway_response': {'fixture': True, 'kind': 'cargo'}, 'paid_at': now - timedelta(days=4),
            },
        )
        PaymentHistory.objects.update_or_create(
            payment=cargo_payment,
            status='pending',
            status_new='completed',
            defaults={'gateway_response': {'fixture': True}},
        )

        for fee in completed_order.completion_fees.all():
            payment, _ = Payment.objects.update_or_create(
                transaction_id=f'DEMO-FEE-PAID-{fee.role.upper()}-001',
                defaults={
                    'user': fee.user, 'order': fee.order, 'completion_fee': fee,
                    'amount': fee.amount, 'currency': fee.currency,
                    'payment_method': 'mock', 'payment_status': 'completed',
                    'gateway_response': {'fixture': True, 'kind': 'completion_fee'},
                    'paid_at': now - timedelta(days=4),
                },
            )
            fee.status = OrderCompletionFee.STATUS_PAID
            fee.paid_payment = payment
            fee.paid_at = payment.paid_at
            fee.waived_at = None
            fee.admin_note = 'Paid demo fixture'
            fee.save(update_fields=['status', 'paid_payment', 'paid_at', 'waived_at', 'admin_note', 'updated_at'])

        blocked_order = orders['fee_blocked']
        for fee in blocked_order.completion_fees.all():
            if fee.paid_payment_id:
                fee.paid_payment = None
            fee.status = OrderCompletionFee.STATUS_PENDING
            fee.paid_at = None
            fee.waived_at = None
            fee.admin_note = 'Pending demo fixture used to verify account gate'
            fee.save(update_fields=['status', 'paid_payment', 'paid_at', 'waived_at', 'admin_note', 'updated_at'])

        Rating.objects.update_or_create(
            order=completed_order,
            from_user=users['client'],
            to_user=users['driver'],
            defaults={'rating': 5, 'comment': 'Доставлено вовремя, водитель всегда был на связи.'},
        )
        Rating.objects.update_or_create(
            order=completed_order,
            from_user=users['driver'],
            to_user=users['client'],
            defaults={'rating': 5, 'comment': 'Чёткое описание груза и быстрая коммуникация.'},
        )
        OrderProofOfDelivery.objects.update_or_create(
            order=completed_order,
            defaults={
                'delivered_by': users['driver'],
                'receiver_name': 'Aziz Karimov',
                'receiver_signature': 'DEMO-SIGNATURE',
                'delivered_lat': Decimal('41.299496'),
                'delivered_lng': Decimal('69.240073'),
                'note': 'Demo proof of delivery',
            },
        )

    def _operations(self, users, orders, now):
        active_order = orders['active']
        DispatcherAssignment.objects.update_or_create(
            dispatcher=users['dispatcher'],
            order=active_order,
            defaults={
                'assigned_driver': users['driver'],
                'status': 'assigned',
                'notes': 'Demo assignment for monitoring and map testing.',
            },
        )
        DispatcherNote.objects.update_or_create(
            dispatcher=users['dispatcher'],
            order=active_order,
            note='Проверить ETA при въезде в Самарканд.',
        )
        UpdateLog.objects.update_or_create(
            updater=users['updater'],
            order=active_order,
            description='Demo fixture: driver location confirmed by operator.',
            defaults={
                'update_type': 'location',
                'old_value': {'lat': 40.3315, 'lng': 68.0523},
                'new_value': {'lat': 40.1158, 'lng': 67.8422},
            },
        )

    def _subscriptions(self, users, now):
        plans = {}
        rows = [
            ('demo-client', 'client', 'Для клиентов', 'Mijozlar uchun', 'For clients', '99000'),
            ('demo-driver', 'driver', 'Для водителей', 'Haydovchilar uchun', 'For drivers', '79000'),
        ]
        for code, audience, name_ru, name_uz, name_en, price in rows:
            plan, _ = SubscriptionPlan.objects.update_or_create(
                code=code,
                defaults={
                    'audience': audience, 'name_ru': name_ru, 'name_uz': name_uz, 'name_en': name_en,
                    'description_ru': 'Demo-тариф на 30 дней',
                    'description_uz': '30 kunlik demo tarif',
                    'description_en': '30-day demo plan',
                    'price': Decimal(price), 'currency': 'UZS', 'duration_days': 30,
                    'first_period_discount_percent': 50, 'is_active': True,
                },
            )
            plans[audience] = plan

        for role in ('client', 'driver'):
            user = users[role]
            plan = plans[role]
            UserSubscription.objects.update_or_create(
                user=user,
                plan=plan,
                defaults={
                    'status': 'active', 'started_at': now - timedelta(days=3),
                    'expires_at': now + timedelta(days=27), 'list_price': plan.price,
                    'charged_amount': plan.intro_price(), 'intro_discount_percent': 50,
                    'is_intro_purchase': True,
                },
            )
            MarketplaceTrialAccount.objects.update_or_create(
                user=user,
                defaults={'free_uses_granted': 3, 'free_uses_consumed': 1, 'trial_disabled': False},
            )

    def _content(self, now):
        News.objects.update_or_create(
            title_ru='[DEMO] Live-трекинг стал плавнее',
            defaults={
                'title_en': '[DEMO] Smoother live tracking',
                'title_uz': '[DEMO] Jonli kuzatuv yanada ravon',
                'text_ru': 'Откройте активный заказ, чтобы проверить маршрут, ETA и позицию водителя.',
                'text_en': 'Open the active order to verify its route, ETA, and driver position.',
                'text_uz': "Faol buyurtmani ochib yo'nalish, ETA va haydovchi joylashuvini tekshiring.",
                'date': now.date(),
            },
        )
        contents = {
            'guide_clients': (
                '1. Создайте объявление. 2. Сравните предложения. 3. Отслеживайте груз. 4. Закройте сервисный сбор.',
                "1. E'lon yarating. 2. Takliflarni solishtiring. 3. Yukni kuzating. 4. Xizmat haqini yoping.",
                '1. Create a listing. 2. Compare bids. 3. Track cargo. 4. Settle the service fee.',
            ),
            'guide_drivers': (
                '1. Добавьте автомобиль. 2. Выберите груз. 3. Передавайте геопозицию. 4. Закройте сервисный сбор.',
                "1. Avtomobil qo'shing. 2. Yukni tanlang. 3. Geolokatsiyani yuboring. 4. Xizmat haqini yoping.",
                '1. Add a vehicle. 2. Choose cargo. 3. Share location. 4. Settle the service fee.',
            ),
            'public_offer': ('Демонстрационная публичная оферта.', 'Demo ommaviy oferta.', 'Demo public offer.'),
            'disclaimer': ('Демонстрационный отказ от ответственности.', 'Demo javobgarlik cheklovi.', 'Demo disclaimer.'),
        }
        for content_type, (ru, uz, en) in contents.items():
            StaticContent.objects.update_or_create(
                content_type=content_type,
                defaults={'content_ru': ru, 'content_uz': uz, 'content_en': en},
            )
