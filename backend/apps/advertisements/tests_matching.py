from decimal import Decimal
from datetime import timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from django.utils import timezone
from rest_framework.test import APIClient

from apps.advertisements.driver_matching import get_driver_matches
from apps.advertisements.load_fit import check_driver_load_fit
from apps.advertisements.models import Advertisement, DriverAvailability, DriverLane
from apps.locations.models import City, Country
from apps.notifications.models import Notification
from apps.orders.models import Order, OrderStatus
from apps.vehicles.models import Vehicle

User = get_user_model()


@override_settings(MATCHING_OFFERS_ASYNC=False)
class DriverMatchingTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'UZ'},
        )
        self.tashkent = City.objects.create(country=country, name_ru='Tashkent', name_en='Tashkent', name_uz='Toshkent')
        self.samarkand = City.objects.create(country=country, name_ru='Samarkand', name_en='Samarkand', name_uz='Samarqand')
        self.client_user = User.objects.create_user(
            phone='998909220001', password='pass', is_client=True, first_name='Client',
        )
        self.driver = User.objects.create_user(
            phone='998909220002', password='pass', is_driver=True, first_name='Driver',
        )
        self.vehicle = Vehicle.objects.create(
            user=self.driver,
            make='Isuzu',
            model='NPR',
            number='01MAT001AA',
            cargo_volume=40,
            load_capacity=8000,
            body_type='reefer',
            is_reefer=True,
            has_adr=True,
            is_heavy_haul=True,
            verification_status='approved',
        )

    def _ad(self, **kwargs):
        defaults = {
            'client': self.client_user,
            'title_ru': 'Yuk',
            'title_en': 'Load',
            'title_uz': 'Yuk',
            'weight': Decimal('2000'),
            'departure_city': self.tashkent,
            'departure_address': 'A',
            'destination_city': self.samarkand,
            'destination_address': 'B',
            'proposed_cost': Decimal('900000'),
        }
        defaults.update(kwargs)
        return Advertisement.objects.create(**defaults)

    def test_availability_and_lane_backhaul_is_primary(self):
        self.api.force_authenticate(user=self.driver)
        patch = self.api.patch('/api/advertisements/driver/availability/', {
            'status': 'available',
            'current_city': self.samarkand.id,
        }, format='json')
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data['effective'], 'available')

        created = self.api.post('/api/advertisements/driver/lanes/', {
            'departure_city': self.tashkent.id,
            'destination_city': self.samarkand.id,
            'weekdays': [1],
            'include_backhaul': True,
        }, format='json')
        self.assertEqual(created.status_code, 201)

        return_ad = self._ad(
            title_uz='Qaytish',
            departure_city=self.samarkand,
            destination_city=self.tashkent,
        )
        outbound = self._ad(title_uz='Ketish')
        payload = get_driver_matches(self.driver, backhaul_only=True)
        self.assertTrue(payload['available'])
        ids = [item['advertisement_id'] for item in payload['matches']]
        self.assertIn(return_ad.id, ids)
        self.assertNotIn(outbound.id, ids)
        self.assertEqual(payload['matches'][0]['match_reason'], 'backhaul')

    def test_adr_reefer_heavy_and_body_are_hard_filters(self):
        cold = self._ad(title_uz='Muzlatgich', requires_reefer=True, required_body_type='reefer')
        fit = check_driver_load_fit(self.driver, Decimal('2000'), advertisement=cold)
        self.assertTrue(fit['fits'])

        self.vehicle.has_adr = False
        self.vehicle.is_reefer = False
        self.vehicle.body_type = 'tent'
        self.vehicle.is_heavy_haul = False
        self.vehicle.save()
        adr = self._ad(title_uz='ADR', requires_adr=True)
        fit = check_driver_load_fit(self.driver, Decimal('2000'), advertisement=adr)
        self.assertFalse(fit['fits'])
        self.assertEqual(fit['reason'], 'adr_required')

    def test_busy_driver_is_hidden_from_feed(self):
        self._ad()
        DriverAvailability.objects.create(user=self.driver, status=DriverAvailability.STATUS_BUSY)
        payload = get_driver_matches(self.driver)
        self.assertEqual(payload['matches'], [])

    def test_for_driver_api_and_auto_offer(self):
        self.api.force_authenticate(user=self.driver)
        DriverLane.objects.create(
            user=self.driver,
            departure_city=self.tashkent,
            destination_city=self.samarkand,
            weekdays=[timezone.localtime().isoweekday()],
            include_backhaul=True,
        )
        with self.captureOnCommitCallbacks(execute=True):
            ad = self._ad(title_uz='Mos e\'lon', required_body_type='reefer', requires_reefer=True)
        response = self.api.get('/api/advertisements/for-driver/')
        self.assertEqual(response.status_code, 200)
        ids = [item['advertisement_id'] for item in response.data['matches']]
        self.assertIn(ad.id, ids)
        self.assertTrue(
            Notification.objects.filter(
                user=self.driver,
                advertisement=ad,
                notification_type='driver_load_offer',
            ).exists()
        )

    def test_on_trip_only_shows_return_loads(self):
        outbound = self._ad()
        Order.objects.create(
            advertisement=outbound,
            driver=self.driver,
            client=self.client_user,
            status=OrderStatus.objects.get(code='in_progress'),
        )
        return_ad = self._ad(
            title_uz='Qaytish',
            departure_city=self.samarkand,
            destination_city=self.tashkent,
        )
        extra = self._ad(
            title_uz='Boshqa',
            departure_city=self.tashkent,
            destination_city=self.samarkand,
            title_ru='Other',
            title_en='Other',
            pickup_window_start=timezone.now() + timedelta(hours=6),
        )
        payload = get_driver_matches(self.driver)
        ids = [item['advertisement_id'] for item in payload['matches']]
        self.assertIn(return_ad.id, ids)
        self.assertNotIn(extra.id, ids)
        self.assertEqual(payload['availability']['effective'], 'on_trip')
        self.assertEqual(payload['availability']['current_city'], 'Samarqand')
        self.assertNotIn('available_from_dt', payload['availability'])

    def test_availability_api_strips_internal_dt_and_requires_schedule(self):
        self.api.force_authenticate(user=self.driver)
        bad = self.api.patch('/api/advertisements/driver/availability/', {
            'status': 'scheduled',
            'available_from': None,
        }, format='json')
        self.assertEqual(bad.status_code, 400)

        ok = self.api.patch('/api/advertisements/driver/availability/', {
            'status': 'scheduled',
            'available_from': (timezone.now() + timedelta(hours=3)).isoformat(),
            'current_city': self.tashkent.id,
        }, format='json')
        self.assertEqual(ok.status_code, 200)
        self.assertEqual(ok.data['effective'], 'scheduled')
        self.assertNotIn('available_from_dt', ok.data)

        get_resp = self.api.get('/api/advertisements/driver/availability/')
        self.assertEqual(get_resp.status_code, 200)
        self.assertNotIn('available_from_dt', get_resp.data)

    def test_auto_offer_skips_when_no_capable_vehicle(self):
        from apps.advertisements.load_offers import notify_driver_load_offers

        other = User.objects.create_user(
            phone='998909220099', password='pass', is_driver=True, first_name='Other',
        )
        Vehicle.objects.create(
            user=other,
            make='Gaz',
            model='Next',
            number='01OTH001AA',
            cargo_volume=10,
            load_capacity=1500,
            body_type='tent',
            verification_status='approved',
        )
        with self.captureOnCommitCallbacks(execute=True):
            ad = self._ad(title_uz='Og\'ir ADR', requires_adr=True, is_heavy=True, weight=Decimal('7000'))
        # Signal allaqachon offer yuborgan; faqat mos mashinasi bor haydovchiga.
        self.assertTrue(
            Notification.objects.filter(
                user=self.driver, advertisement=ad, notification_type='driver_load_offer',
            ).exists()
        )
        self.assertFalse(
            Notification.objects.filter(
                user=other, advertisement=ad, notification_type='driver_load_offer',
            ).exists()
        )
        # Takroriy chaqiruv spam qilmasin.
        self.assertEqual(notify_driver_load_offers(ad), 0)

        no_match = Advertisement(
            client=self.client_user,
            title_ru='Tanker',
            title_en='Tanker',
            title_uz='Faqat tanker',
            weight=Decimal('500'),
            departure_city=self.tashkent,
            departure_address='A',
            destination_city=self.samarkand,
            destination_address='B',
            proposed_cost=Decimal('100000'),
            required_body_type='tanker',
        )
        no_match.save()
        Notification.objects.filter(advertisement=no_match).delete()
        self.assertEqual(notify_driver_load_offers(no_match), 0)

    def test_reorder_copies_matching_fields(self):
        from apps.advertisements.reorder import duplicate_advertisement_from_order

        source = self._ad(
            required_body_type='reefer',
            requires_adr=True,
            requires_reefer=True,
            is_heavy=True,
        )
        order = Order.objects.create(
            advertisement=source,
            driver=self.driver,
            client=self.client_user,
            status=OrderStatus.objects.get(code='completed'),
        )
        copy = duplicate_advertisement_from_order(order)
        self.assertEqual(copy.required_body_type, 'reefer')
        self.assertTrue(copy.requires_adr)
        self.assertTrue(copy.requires_reefer)
        self.assertTrue(copy.is_heavy)

    def test_current_city_boosts_nearby_loads(self):
        DriverAvailability.objects.create(
            user=self.driver,
            status=DriverAvailability.STATUS_AVAILABLE,
            current_city=self.samarkand,
        )
        near = self._ad(
            title_uz='Yaqin',
            departure_city=self.samarkand,
            destination_city=self.tashkent,
        )
        far = self._ad(title_uz='Uzoq')
        payload = get_driver_matches(self.driver)
        ids = [item['advertisement_id'] for item in payload['matches']]
        self.assertIn(near.id, ids)
        self.assertIn(far.id, ids)
        near_hit = next(item for item in payload['matches'] if item['advertisement_id'] == near.id)
        self.assertIn('nearby', near_hit['reasons'])
        self.assertGreaterEqual(near_hit['match_score'], 50)

    def test_lane_patch_toggles_backhaul_and_active(self):
        self.api.force_authenticate(user=self.driver)
        lane = DriverLane.objects.create(
            user=self.driver,
            departure_city=self.tashkent,
            destination_city=self.samarkand,
            weekdays=[1, 2],
            include_backhaul=True,
        )
        patched = self.api.patch(
            f'/api/advertisements/driver/lanes/{lane.id}/',
            {'include_backhaul': False, 'is_active': False, 'weekdays': [5]},
            format='json',
        )
        self.assertEqual(patched.status_code, 200)
        self.assertFalse(patched.data['include_backhaul'])
        self.assertFalse(patched.data['is_active'])
        self.assertEqual(patched.data['weekdays'], [5])
        lane.refresh_from_db()
        self.assertFalse(lane.is_active)
        # Inactive lane should not score as lane match.
        self._ad()
        payload = get_driver_matches(self.driver)
        for item in payload['matches']:
            self.assertNotIn('lane', item['reasons'])

    def test_backhaul_visible_without_vehicle(self):
        DriverAvailability.objects.create(
            user=self.driver,
            status=DriverAvailability.STATUS_AVAILABLE,
            current_city=self.samarkand,
        )
        Vehicle.objects.filter(user=self.driver).delete()
        return_ad = self._ad(
            title_uz='Qaytish',
            departure_city=self.samarkand,
            destination_city=self.tashkent,
        )
        payload = get_driver_matches(self.driver, backhaul_only=True)
        ids = [item['advertisement_id'] for item in payload['matches']]
        self.assertIn(return_ad.id, ids)

    def test_schedule_offers_runs_sync_under_tests(self):
        from apps.advertisements.tasks import schedule_driver_load_offers

        ad = self._ad(title_uz='Sync offer', required_body_type='reefer', requires_reefer=True)
        Notification.objects.filter(advertisement=ad).delete()
        schedule_driver_load_offers(ad.id)
        self.assertTrue(
            Notification.objects.filter(
                user=self.driver,
                advertisement=ad,
                notification_type='driver_load_offer',
            ).exists()
        )

    def test_lane_time_window_scores_and_filters(self):
        self.api.force_authenticate(user=self.driver)
        created = self.api.post('/api/advertisements/driver/lanes/', {
            'departure_city': self.tashkent.id,
            'destination_city': self.samarkand.id,
            'weekdays': [],
            'include_backhaul': False,
            'time_from_hour': 8,
            'time_to_hour': 12,
        }, format='json')
        self.assertEqual(created.status_code, 201)
        self.assertEqual(created.data['time_from_hour'], 8)
        self.assertEqual(created.data['time_to_hour'], 12)

        local_now = timezone.localtime()
        morning = local_now.replace(hour=9, minute=0, second=0, microsecond=0)
        evening = local_now.replace(hour=18, minute=0, second=0, microsecond=0)
        in_window = self._ad(title_uz='Ertalab', pickup_window_start=morning)
        out_window = self._ad(title_uz='Kechqurun', pickup_window_start=evening)
        payload = get_driver_matches(self.driver)
        by_id = {item['advertisement_id']: item for item in payload['matches']}
        self.assertIn(in_window.id, by_id)
        self.assertIn('time_slot', by_id[in_window.id]['reasons'])
        self.assertIn('lane', by_id[in_window.id]['reasons'])
        # Outside window: still may appear as open load, but without lane/time_slot.
        if out_window.id in by_id:
            self.assertNotIn('lane', by_id[out_window.id]['reasons'])
            self.assertNotIn('time_slot', by_id[out_window.id]['reasons'])

    def test_matching_prefers_lane_city_over_unrelated_recent(self):
        """Scale: candidates come from lane cities, not only the latest N global ads."""
        other = City.objects.create(
            country=self.tashkent.country,
            name_ru='Other',
            name_en='Other',
            name_uz='Boshqa',
        )
        DriverLane.objects.create(
            user=self.driver,
            departure_city=self.tashkent,
            destination_city=self.samarkand,
            weekdays=[],
            include_backhaul=False,
        )
        lane_ad = self._ad(title_uz='Lane hit')
        # Flood newer unrelated ads — naive "last N by created_at" would bury lane_ad.
        for i in range(200):
            self._ad(
                title_uz=f'Noise {i}',
                departure_city=other,
                destination_city=self.tashkent,
            )
        payload = get_driver_matches(self.driver, limit=20)
        ids = [item['advertisement_id'] for item in payload['matches']]
        self.assertIn(lane_ad.id, ids)
        hit = next(item for item in payload['matches'] if item['advertisement_id'] == lane_ad.id)
        self.assertIn('lane', hit['reasons'])

    @override_settings(MATCHING_OFFERS_ASYNC=True, CELERY_TASK_ALWAYS_EAGER=False)
    def test_offers_sync_when_celery_workers_offline(self):
        from apps.advertisements import tasks as offer_tasks

        ad = self._ad(title_uz='No worker', required_body_type='reefer', requires_reefer=True)
        Notification.objects.filter(advertisement=ad).delete()
        offer_tasks._WORKER_CACHE['ok'] = None
        offer_tasks._WORKER_CACHE['at'] = 0.0

        original_check = offer_tasks._celery_workers_online

        def fake_offline():
            return False

        offer_tasks._celery_workers_online = fake_offline
        try:
            offer_tasks.schedule_driver_load_offers(ad.id)
        finally:
            offer_tasks._celery_workers_online = original_check

        self.assertTrue(
            Notification.objects.filter(
                user=self.driver,
                advertisement=ad,
                notification_type='driver_load_offer',
            ).exists()
        )
