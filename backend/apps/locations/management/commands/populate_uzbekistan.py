from django.core.management.base import BaseCommand
from apps.locations.models import Country, City
from apps.locations.seed_data import UZBEKISTAN_CITIES


class Command(BaseCommand):
    help = 'O\'zbekistonning barcha viloyatlari va shaharlarini qo\'shish'

    def handle(self, *args, **options):
        self.stdout.write('O\'zbekiston viloyatlari va shaharlarini qo\'shish...')

        uz, created = Country.objects.get_or_create(
            code='UZ',
            defaults={
                'name_ru': 'Узбекистан',
                'name_en': 'Uzbekistan',
                'name_uz': "O'zbekiston"
            }
        )
        if created:
            self.stdout.write(f'  Mamlakat yaratildi: {uz.name_uz}')

        coords_by_en = {
            row['name_en'].lower(): (row['latitude'], row['longitude'])
            for row in UZBEKISTAN_CITIES
            if isinstance(row, dict)
        }

        uzbekistan_cities = [
            ('Ташкент', 'Tashkent', 'Toshkent'),
            ('Андижан', 'Andijan', 'Andijon'),
            ('Асака', 'Asaka', 'Asaka'),
            ('Ханабад', 'Khanabad', 'Xonobod'),
            ('Пахтаабад', 'Pakhtaabad', 'Paxtaobod'),
            ('Бухара', 'Bukhara', 'Buxoro'),
            ('Гиждуван', 'Gijduvan', 'G\'ijduvon'),
            ('Каган', 'Kagan', 'Kogon'),
            ('Карши', 'Karshi', 'Qarshi'),
            ('Шахрисабз', 'Shakhrisabz', 'Shahrisabz'),
            ('Китаб', 'Kitab', 'Kitob'),
            ('Гузар', 'Guzar', 'Guzor'),
            ('Фергана', 'Fergana', 'Farg\'ona'),
            ('Коканд', 'Kokand', 'Qo\'qon'),
            ('Маргилан', 'Margilan', 'Marg\'ilon'),
            ('Кувасай', 'Kuvasay', 'Quvasoy'),
            ('Кува', 'Kuva', 'Quva'),
            ('Риштан', 'Rishtan', 'Rishton'),
            ('Алтыарык', 'Altyaryk', 'Oltiariq'),
            ('Бешарык', 'Besharyk', 'Beshariq'),
            ('Яйпан', 'Yaypan', 'Yaypan'),
            ('Джизак', 'Jizzakh', 'Jizzax'),
            ('Гагарин', 'Gagarin', 'Gagarin'),
            ('Дустлик', 'Dustlik', 'Do\'stlik'),
            ('Пахтакор', 'Pakhtakor', 'Paxtakor'),
            ('Навoi', 'Navoi', 'Navoiy'),
            ('Зарафшан', 'Zarafshan', 'Zarafshon'),
            ('Учкудук', 'Uchkuduk', 'Uchquduq'),
            ('Кармана', 'Karmana', 'Karmana'),
            ('Наманган', 'Namangan', 'Namangan'),
            ('Чуст', 'Chust', 'Chust'),
            ('Касансай', 'Kasansay', 'Kosonsoy'),
            ('Пап', 'Pap', 'Pop'),
            ('Туракурган', 'Turakurgan', 'To\'raqo\'rg\'on'),
            ('Учкурган', 'Uchkurgan', 'Uchqo\'rg\'on'),
            ('Самарканд', 'Samarkand', 'Samarqand'),
            ('Каттакурган', 'Kattakurgan', 'Kattaqo\'rg\'on'),
            ('Ургут', 'Urgut', 'Urgut'),
            ('Джамбай', 'Jambay', 'Jomboy'),
            ('Акташ', 'Aktash', 'Oqtosh'),
            ('Гулистан', 'Gulistan', 'Guliston'),
            ('Сырдарья', 'Syrdarya', 'Sirdaryo'),
            ('Ширин', 'Shirin', 'Shirin'),
            ('Бахт', 'Baht', 'Baxt'),
            ('Термез', 'Termez', 'Termiz'),
            ('Денау', 'Denau', 'Denov'),
            ('Шурчи', 'Shurchi', 'Shurchi'),
            ('Сариасия', 'Sariasya', 'Sariosiyo'),
            ('Шерабад', 'Sherabad', 'Sherobod'),
            ('Нукус', 'Nukus', 'Nukus'),
            ('Муйнак', 'Moynaq', 'Mo\'ynoq'),
            ('Ходжейли', 'Khojeyli', 'Xo\'jayli'),
            ('Беруни', 'Beruni', 'Beruniy'),
            ('Чимбай', 'Chimbay', 'Chimboy'),
            ('Ургенч', 'Urgench', 'Urganch'),
            ('Хива', 'Khiva', 'Xiva'),
            ('Питнак', 'Pitnak', 'Pitnak'),
            ('Ханка', 'Khanka', 'Xonqa'),
            ('Шават', 'Shavat', 'Shovot'),
            ('Ангрен', 'Angren', 'Angren'),
            ('Бекабад', 'Bekabad', 'Bekobod'),
            ('Чирчик', 'Chirchik', 'Chirchiq'),
            ('Олмалык', 'Almalyk', 'Olmaliq'),
            ('Янгиюль', 'Yangiyul', 'Yangiyo\'l'),
            ('Янгиер', 'Yangiyer', 'Yangiyer'),
            ('Паркент', 'Parkent', 'Parkent'),
            ('Кибрай', 'Kibray', 'Qibray'),
            ('Чиназ', 'Chinaz', 'Chinoz'),
            ('Зангиата', 'Zangiota', 'Zangiota'),
            ('Бука', 'Buka', 'Bo\'ka'),
            ('Аккурган', 'Akkurgan', 'Oqqo\'rg\'on'),
            ('Шахрихан', 'Shakhrikhan', 'Shahrixon'),
            ('Пайтуг', 'Paytug', 'Paytug'),
            ('Баликчи', 'Balikchi', 'Baliqchi'),
            ('Карасу', 'Karasu', 'Qorasuv'),
        ]

        added_count = 0
        updated_coords = 0
        for name_ru, name_en, name_uz in uzbekistan_cities:
            defaults = {
                'name_en': name_en,
                'name_uz': name_uz,
            }
            coords = coords_by_en.get(name_en.lower())
            if coords:
                defaults['latitude'] = coords[0]
                defaults['longitude'] = coords[1]
            city, created = City.objects.get_or_create(
                country=uz,
                name_ru=name_ru,
                defaults=defaults,
            )
            if created:
                added_count += 1
                self.stdout.write(f'  Shahar qo\'shildi: {city.name_uz}')
            elif coords and (city.latitude is None or city.longitude is None):
                city.latitude = coords[0]
                city.longitude = coords[1]
                city.save(update_fields=['latitude', 'longitude'])
                updated_coords += 1

        self.stdout.write(self.style.SUCCESS(
            f'Jami {added_count} ta shahar qo\'shildi, {updated_coords} ta koordinata yangilandi!'
        ))
