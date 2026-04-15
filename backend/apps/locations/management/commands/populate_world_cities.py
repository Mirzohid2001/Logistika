from collections import defaultdict

from django.core.management.base import BaseCommand

from apps.locations.models import City, Country


class Command(BaseCommand):
    help = "Populate countries and cities from geonamescache dataset"

    def add_arguments(self, parser):
        parser.add_argument(
            "--country",
            type=str,
            default="",
            help="Optional ISO country code filter, e.g. US",
        )
        parser.add_argument(
            "--min-population",
            type=int,
            default=10000,
            help="Minimum city population to import (default: 10000)",
        )

    def handle(self, *args, **options):
        try:
            import geonamescache
        except Exception as exc:
            self.stderr.write(self.style.ERROR(f"geonamescache import error: {exc}"))
            return

        country_filter = (options.get("country") or "").strip().upper()
        min_population = max(0, int(options.get("min_population", 10000)))

        gc = geonamescache.GeonamesCache()
        countries = gc.get_countries()
        cities = gc.get_cities()

        country_name_maps = {}
        imported_country_codes = []

        for code, c in countries.items():
            if country_filter and code != country_filter:
                continue
            country, _ = Country.objects.get_or_create(
                code=code,
                defaults={
                    "name_ru": c["name"],
                    "name_en": c["name"],
                    "name_uz": c["name"],
                },
            )
            imported_country_codes.append(code)
            country_name_maps[code] = country

        created_cities = 0
        updated_cities = 0
        skipped_duplicates = 0
        existing_names = defaultdict(set)

        for country in Country.objects.filter(code__in=imported_country_codes).only("id", "code"):
            for name_ru in City.objects.filter(country=country).values_list("name_ru", flat=True):
                existing_names[country.code].add(name_ru)

        for city in cities.values():
            country_code = city.get("countrycode")
            if country_filter and country_code != country_filter:
                continue
            if country_code not in country_name_maps:
                continue

            population = int(city.get("population") or 0)
            if population < min_population:
                continue

            country = country_name_maps[country_code]
            base_name = (city.get("name") or "").strip()
            if not base_name:
                continue

            name_ru = base_name
            if name_ru in existing_names[country_code]:
                admin_code = (city.get("admin1code") or "").strip()
                if admin_code:
                    candidate = f"{base_name} ({admin_code})"
                    if candidate not in existing_names[country_code]:
                        name_ru = candidate
                    else:
                        skipped_duplicates += 1
                        continue
                else:
                    skipped_duplicates += 1
                    continue

            _, created = City.objects.get_or_create(
                country=country,
                name_ru=name_ru,
                defaults={
                    "name_en": base_name,
                    "name_uz": base_name,
                },
            )
            existing_names[country_code].add(name_ru)
            if created:
                created_cities += 1
            else:
                updated_cities += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. Countries in scope: {len(imported_country_codes)}, "
                f"cities created: {created_cities}, duplicates skipped: {skipped_duplicates}."
            )
        )
