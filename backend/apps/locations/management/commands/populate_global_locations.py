from django.core.management.base import BaseCommand
from apps.locations.models import Country, City


COUNTRIES_WITH_CITIES = [
    {
        "code": "UZ",
        "name_ru": "Узбекистан",
        "name_en": "Uzbekistan",
        "name_uz": "O'zbekiston",
        "cities": [
            ("Ташкент", "Tashkent", "Toshkent"),
            ("Самарканд", "Samarkand", "Samarqand"),
            ("Бухара", "Bukhara", "Buxoro"),
            ("Наманган", "Namangan", "Namangan"),
            ("Андижан", "Andijan", "Andijon"),
            ("Фергана", "Fergana", "Farg'ona"),
        ],
    },
    {
        "code": "KZ",
        "name_ru": "Казахстан",
        "name_en": "Kazakhstan",
        "name_uz": "Qozog'iston",
        "cities": [
            ("Алматы", "Almaty", "Olmaota"),
            ("Астана", "Astana", "Astana"),
            ("Шымкент", "Shymkent", "Shimkent"),
            ("Караганда", "Karaganda", "Qarag'anda"),
        ],
    },
    {
        "code": "KG",
        "name_ru": "Кыргызстан",
        "name_en": "Kyrgyzstan",
        "name_uz": "Qirg'iziston",
        "cities": [
            ("Бишкек", "Bishkek", "Bishkek"),
            ("Ош", "Osh", "O'sh"),
            ("Джалал-Абад", "Jalal-Abad", "Jalolobod"),
            ("Каракол", "Karakol", "Qoraqo'l"),
        ],
    },
    {
        "code": "TJ",
        "name_ru": "Таджикистан",
        "name_en": "Tajikistan",
        "name_uz": "Tojikiston",
        "cities": [
            ("Душанбе", "Dushanbe", "Dushanbe"),
            ("Худжанд", "Khujand", "Xo'jand"),
            ("Бохтар", "Bokhtar", "Boxtar"),
            ("Куляб", "Kulob", "Ko'lob"),
        ],
    },
    {
        "code": "TM",
        "name_ru": "Туркменистан",
        "name_en": "Turkmenistan",
        "name_uz": "Turkmaniston",
        "cities": [
            ("Ашхабад", "Ashgabat", "Ashxobod"),
            ("Туркменабат", "Turkmenabat", "Turkmanobod"),
            ("Дашогуз", "Dashoguz", "Dashog'uz"),
            ("Мары", "Mary", "Mari"),
        ],
    },
    {
        "code": "RU",
        "name_ru": "Россия",
        "name_en": "Russia",
        "name_uz": "Rossiya",
        "cities": [
            ("Москва", "Moscow", "Moskva"),
            ("Санкт-Петербург", "Saint Petersburg", "Sankt-Peterburg"),
            ("Казань", "Kazan", "Qozon"),
            ("Екатеринбург", "Yekaterinburg", "Yekaterinburg"),
            ("Новосибирск", "Novosibirsk", "Novosibirsk"),
        ],
    },
    {
        "code": "TR",
        "name_ru": "Турция",
        "name_en": "Turkey",
        "name_uz": "Turkiya",
        "cities": [
            ("Стамбул", "Istanbul", "Istanbul"),
            ("Анкара", "Ankara", "Anqara"),
            ("Измир", "Izmir", "Izmir"),
            ("Бурса", "Bursa", "Bursa"),
        ],
    },
    {
        "code": "AE",
        "name_ru": "ОАЭ",
        "name_en": "United Arab Emirates",
        "name_uz": "BAA",
        "cities": [
            ("Дубай", "Dubai", "Dubay"),
            ("Абу-Даби", "Abu Dhabi", "Abu Dabi"),
            ("Шарджа", "Sharjah", "Sharja"),
            ("Аджман", "Ajman", "Ajman"),
        ],
    },
    {
        "code": "SA",
        "name_ru": "Саудовская Аравия",
        "name_en": "Saudi Arabia",
        "name_uz": "Saudiya Arabistoni",
        "cities": [
            ("Эр-Рияд", "Riyadh", "Ar-Riyod"),
            ("Джидда", "Jeddah", "Jidda"),
            ("Мекка", "Mecca", "Makka"),
            ("Медина", "Medina", "Madina"),
        ],
    },
    {
        "code": "QA",
        "name_ru": "Катар",
        "name_en": "Qatar",
        "name_uz": "Qatar",
        "cities": [
            ("Доха", "Doha", "Doha"),
            ("Аль-Райян", "Al Rayyan", "Ar-Rayyan"),
            ("Умм-Салаль", "Umm Salal", "Umm Salal"),
        ],
    },
    {
        "code": "CN",
        "name_ru": "Китай",
        "name_en": "China",
        "name_uz": "Xitoy",
        "cities": [
            ("Пекин", "Beijing", "Pekin"),
            ("Шанхай", "Shanghai", "Shanxay"),
            ("Гуанчжоу", "Guangzhou", "Guanchjou"),
            ("Шэньчжэнь", "Shenzhen", "Shenchjen"),
            ("Урумчи", "Urumqi", "Urumchi"),
        ],
    },
    {
        "code": "IN",
        "name_ru": "Индия",
        "name_en": "India",
        "name_uz": "Hindiston",
        "cities": [
            ("Дели", "Delhi", "Dehli"),
            ("Мумбаи", "Mumbai", "Mumbay"),
            ("Бангалор", "Bengaluru", "Bangalor"),
            ("Хайдарабад", "Hyderabad", "Haydarobod"),
        ],
    },
    {
        "code": "PK",
        "name_ru": "Пакистан",
        "name_en": "Pakistan",
        "name_uz": "Pokiston",
        "cities": [
            ("Карачи", "Karachi", "Karachi"),
            ("Лахор", "Lahore", "Lahor"),
            ("Исламабад", "Islamabad", "Islomobod"),
            ("Фейсалабад", "Faisalabad", "Faysalobod"),
        ],
    },
    {
        "code": "DE",
        "name_ru": "Германия",
        "name_en": "Germany",
        "name_uz": "Germaniya",
        "cities": [
            ("Берлин", "Berlin", "Berlin"),
            ("Гамбург", "Hamburg", "Gamburg"),
            ("Мюнхен", "Munich", "Myunxen"),
            ("Франкфурт", "Frankfurt", "Frankfurt"),
        ],
    },
    {
        "code": "FR",
        "name_ru": "Франция",
        "name_en": "France",
        "name_uz": "Fransiya",
        "cities": [
            ("Париж", "Paris", "Parij"),
            ("Лион", "Lyon", "Lion"),
            ("Марсель", "Marseille", "Marsel"),
            ("Лилль", "Lille", "Lill"),
        ],
    },
    {
        "code": "IT",
        "name_ru": "Италия",
        "name_en": "Italy",
        "name_uz": "Italiya",
        "cities": [
            ("Рим", "Rome", "Rim"),
            ("Милан", "Milan", "Milan"),
            ("Неаполь", "Naples", "Neapol"),
            ("Турин", "Turin", "Turin"),
        ],
    },
    {
        "code": "ES",
        "name_ru": "Испания",
        "name_en": "Spain",
        "name_uz": "Ispaniya",
        "cities": [
            ("Мадрид", "Madrid", "Madrid"),
            ("Барселона", "Barcelona", "Barselona"),
            ("Валенсия", "Valencia", "Valensiya"),
            ("Севилья", "Seville", "Sevilya"),
        ],
    },
    {
        "code": "NL",
        "name_ru": "Нидерланды",
        "name_en": "Netherlands",
        "name_uz": "Niderlandiya",
        "cities": [
            ("Амстердам", "Amsterdam", "Amsterdam"),
            ("Роттердам", "Rotterdam", "Rotterdam"),
            ("Гаага", "The Hague", "Gaaga"),
            ("Утрехт", "Utrecht", "Utrext"),
        ],
    },
    {
        "code": "PL",
        "name_ru": "Польша",
        "name_en": "Poland",
        "name_uz": "Polsha",
        "cities": [
            ("Варшава", "Warsaw", "Varshava"),
            ("Краков", "Krakow", "Krakov"),
            ("Гданьск", "Gdansk", "Gdansk"),
            ("Вроцлав", "Wroclaw", "Vrotslav"),
        ],
    },
    {
        "code": "GB",
        "name_ru": "Великобритания",
        "name_en": "United Kingdom",
        "name_uz": "Buyuk Britaniya",
        "cities": [
            ("Лондон", "London", "London"),
            ("Манчестер", "Manchester", "Manchester"),
            ("Бирмингем", "Birmingham", "Birmingem"),
            ("Ливерпуль", "Liverpool", "Liverpul"),
        ],
    },
    {
        "code": "US",
        "name_ru": "США",
        "name_en": "United States",
        "name_uz": "AQSh",
        "cities": [
            ("Нью-Йорк", "New York", "Nyu-York"),
            ("Лос-Анджелес", "Los Angeles", "Los-Anjeles"),
            ("Чикаго", "Chicago", "Chikago"),
            ("Хьюстон", "Houston", "Hyuston"),
        ],
    },
    {
        "code": "CA",
        "name_ru": "Канада",
        "name_en": "Canada",
        "name_uz": "Kanada",
        "cities": [
            ("Торонто", "Toronto", "Toronto"),
            ("Ванкувер", "Vancouver", "Vankuver"),
            ("Монреаль", "Montreal", "Monreal"),
            ("Калгари", "Calgary", "Kalgari"),
        ],
    },
    {
        "code": "BR",
        "name_ru": "Бразилия",
        "name_en": "Brazil",
        "name_uz": "Braziliya",
        "cities": [
            ("Сан-Паулу", "Sao Paulo", "San-Paulu"),
            ("Рио-де-Жанейро", "Rio de Janeiro", "Rio-de-Janeyro"),
            ("Бразилиа", "Brasilia", "Brazilia"),
            ("Салвадор", "Salvador", "Salvador"),
        ],
    },
    {
        "code": "MX",
        "name_ru": "Мексика",
        "name_en": "Mexico",
        "name_uz": "Meksika",
        "cities": [
            ("Мехико", "Mexico City", "Mexiko"),
            ("Гвадалахара", "Guadalajara", "Guadalaxara"),
            ("Монтеррей", "Monterrey", "Monterrey"),
            ("Пуэбла", "Puebla", "Puebla"),
        ],
    },
    {
        "code": "JP",
        "name_ru": "Япония",
        "name_en": "Japan",
        "name_uz": "Yaponiya",
        "cities": [
            ("Токио", "Tokyo", "Tokio"),
            ("Осака", "Osaka", "Osaka"),
            ("Нагоя", "Nagoya", "Nagoya"),
            ("Йокогама", "Yokohama", "Yokogama"),
        ],
    },
    {
        "code": "KR",
        "name_ru": "Южная Корея",
        "name_en": "South Korea",
        "name_uz": "Janubiy Koreya",
        "cities": [
            ("Сеул", "Seoul", "Seul"),
            ("Пусан", "Busan", "Pusan"),
            ("Инчхон", "Incheon", "Inchxon"),
            ("Тэгу", "Daegu", "Tegu"),
        ],
    },
    {
        "code": "ID",
        "name_ru": "Индонезия",
        "name_en": "Indonesia",
        "name_uz": "Indoneziya",
        "cities": [
            ("Джакарта", "Jakarta", "Jakarta"),
            ("Сурабая", "Surabaya", "Surabaya"),
            ("Бандунг", "Bandung", "Bandung"),
            ("Медан", "Medan", "Medan"),
        ],
    },
    {
        "code": "MY",
        "name_ru": "Малайзия",
        "name_en": "Malaysia",
        "name_uz": "Malayziya",
        "cities": [
            ("Куала-Лумпур", "Kuala Lumpur", "Kuala-Lumpur"),
            ("Джохор-Бару", "Johor Bahru", "Johor-Bahru"),
            ("Пенанг", "Penang", "Penang"),
            ("Кота-Кинабалу", "Kota Kinabalu", "Kota-Kinabalu"),
        ],
    },
]


class Command(BaseCommand):
    help = "Populate global countries and major cities"

    def handle(self, *args, **options):
        countries_added = 0
        cities_added = 0

        for item in COUNTRIES_WITH_CITIES:
            country, country_created = Country.objects.get_or_create(
                code=item["code"],
                defaults={
                    "name_ru": item["name_ru"],
                    "name_en": item["name_en"],
                    "name_uz": item["name_uz"],
                },
            )
            if country_created:
                countries_added += 1
            else:
                # Keep names synced even if country already existed
                country.name_ru = item["name_ru"]
                country.name_en = item["name_en"]
                country.name_uz = item["name_uz"]
                country.save(update_fields=["name_ru", "name_en", "name_uz"])

            for name_ru, name_en, name_uz in item["cities"]:
                _, city_created = City.objects.get_or_create(
                    country=country,
                    name_ru=name_ru,
                    defaults={"name_en": name_en, "name_uz": name_uz},
                )
                if city_created:
                    cities_added += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Added countries: {countries_added}, added cities: {cities_added}."
            )
        )
