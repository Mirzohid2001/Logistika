from io import StringIO
from pathlib import Path
from tempfile import TemporaryDirectory

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase

from apps.advertisements.models import Advertisement
from apps.orders.models import Order, OrderLocationTrack
from apps.payments.models import OrderCompletionFee
from apps.vehicles.models import Vehicle


User = get_user_model()


class SeedDemoCommandTests(TestCase):
    def test_seed_demo_is_complete_and_idempotent(self):
        with TemporaryDirectory() as media_root, self.settings(MEDIA_ROOT=media_root):
            output = StringIO()
            call_command('seed_demo', stdout=output)

            first_counts = {
                'users': User.objects.filter(phone__startswith='+9989010001').count(),
                'vehicles': Vehicle.objects.count(),
                'advertisements': Advertisement.objects.count(),
                'orders': Order.objects.count(),
                'tracks': OrderLocationTrack.objects.count(),
                'pending_fees': OrderCompletionFee.objects.filter(
                    status=OrderCompletionFee.STATUS_PENDING,
                ).count(),
            }

            call_command('seed_demo', stdout=StringIO())
            self.assertTrue((Path(media_root) / 'demo/driver-license.png').is_file())

        self.assertEqual(
            first_counts,
            {
                'users': 7,
                'vehicles': 2,
                'advertisements': 4,
                'orders': 3,
                'tracks': 7,
                'pending_fees': 2,
            },
        )
        self.assertEqual(
            first_counts,
            {
                'users': User.objects.filter(phone__startswith='+9989010001').count(),
                'vehicles': Vehicle.objects.count(),
                'advertisements': Advertisement.objects.count(),
                'orders': Order.objects.count(),
                'tracks': OrderLocationTrack.objects.count(),
                'pending_fees': OrderCompletionFee.objects.filter(
                    status=OrderCompletionFee.STATUS_PENDING,
                ).count(),
            },
        )

        admin = User.objects.get(phone='+998901000100')
        driver = User.objects.get(phone='+998901000102')
        self.assertTrue(admin.is_superuser)
        self.assertTrue(admin.check_password('demo12345'))
        self.assertTrue(driver.is_driver)
        self.assertTrue(driver.document_photos)
        self.assertIn('Demo fixtures are ready.', output.getvalue())
