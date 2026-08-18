from django.core.management import call_command
from django.core.management.base import BaseCommand

from apps.locations.models import Country, City


PRIORITY_COUNTRY_CODES = (
    'UZ', 'KZ', 'KG', 'TJ', 'TM', 'RU', 'TR', 'CN', 'AE', 'SA',
    'DE', 'PL', 'US', 'IN', 'PK', 'IR', 'AZ', 'GE', 'AF', 'LV',
)


class Command(BaseCommand):
    help = 'Import world countries and major cities for logistics catalog.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--min-population',
            type=int,
            default=15000,
            help='Minimum city population for geonames import (default: 15000)',
        )

    def handle(self, *args, **options):
        min_population = max(0, int(options['min_population']))

        try:
            import geonamescache
        except ImportError:
            self.stderr.write(self.style.WARNING('geonamescache not installed; skipping world import.'))
            geonamescache = None

        countries_created = 0
        if geonamescache is not None:
            gc = geonamescache.GeonamesCache()
            for code, meta in gc.get_countries().items():
                _, created = Country.objects.get_or_create(
                    code=code,
                    defaults={
                        'name_ru': meta['name'],
                        'name_en': meta['name'],
                        'name_uz': meta['name'],
                    },
                )
                if created:
                    countries_created += 1

        call_command('populate_uzbekistan')

        cities_imported = 0
        if geonamescache is not None:
            for code in PRIORITY_COUNTRY_CODES:
                before = City.objects.filter(country__code=code).count()
                call_command(
                    'populate_world_cities',
                    country=code,
                    min_population=min_population,
                    verbosity=0,
                )
                after = City.objects.filter(country__code=code).count()
                cities_imported += max(0, after - before)

        self.stdout.write(
            self.style.SUCCESS(
                f'Location catalog ready: {Country.objects.count()} countries, '
                f'{City.objects.count()} cities '
                f'(+{countries_created} countries, +{cities_imported} cities this run).'
            )
        )
