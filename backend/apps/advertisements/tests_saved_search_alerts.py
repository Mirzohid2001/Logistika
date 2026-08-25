from decimal import Decimal
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.advertisements.models import Advertisement, SavedSearch
from apps.advertisements.saved_search_matching import advertisement_matches_saved_search
from apps.locations.models import City, Country
from apps.notifications.models import Notification

User = get_user_model()


class SavedSearchAlertsTest(TestCase):
    def setUp(self):
        self.country = Country.objects.create(
            name_ru='UZ', name_en='UZ', name_uz='UZ', code='S1',
        )
        self.city_a = City.objects.create(
            country=self.country, name_ru='A', name_en='A', name_uz='A',
        )
        self.city_b = City.objects.create(
            country=self.country, name_ru='B', name_en='B', name_uz='B',
        )
        self.client_user = User.objects.create_user(phone='998901100001', password='pass', is_client=True)
        self.driver_user = User.objects.create_user(
            phone='998901100002', password='pass', is_driver=True, is_client=False,
        )
        self.saved_search = SavedSearch.objects.create(
            user=self.driver_user,
            name='Toshkent-Buxoro',
            departure_city=self.city_a,
            destination_city=self.city_b,
            min_weight=Decimal('100'),
            alerts_enabled=True,
        )

    def _create_ad(self, **kwargs):
        defaults = {
            'client': self.client_user,
            'title_ru': 'Test', 'title_en': 'Test', 'title_uz': 'Test',
            'description_ru': '', 'description_en': '', 'description_uz': '',
            'weight': Decimal('500'),
            'departure_city': self.city_a,
            'departure_address': 'Addr A',
            'destination_city': self.city_b,
            'destination_address': 'Addr B',
            'proposed_cost': Decimal('1000000'),
        }
        defaults.update(kwargs)
        return Advertisement.objects.create(**defaults)

    def test_match_helper_respects_filters(self):
        ad = self._create_ad()
        self.assertTrue(advertisement_matches_saved_search(ad, self.saved_search))
        ad.weight = Decimal('50')
        self.assertFalse(advertisement_matches_saved_search(ad, self.saved_search))

    @patch('apps.advertisements.signals.notify_saved_search_matches')
    def test_signal_called_on_ad_create(self, mock_notify):
        with self.captureOnCommitCallbacks(execute=True):
            self._create_ad()
        mock_notify.assert_called_once()

    def test_notify_creates_notification_on_ad_create(self):
        with self.captureOnCommitCallbacks(execute=True):
            ad = self._create_ad()
        self.assertTrue(
            Notification.objects.filter(
                user=self.driver_user,
                notification_type='saved_search_match',
                advertisement=ad,
            ).exists()
        )

    def test_notify_skips_when_alerts_disabled(self):
        self.saved_search.alerts_enabled = False
        self.saved_search.save(update_fields=['alerts_enabled'])
        ad = self._create_ad()
        self.assertFalse(
            Notification.objects.filter(
                user=self.driver_user,
                notification_type='saved_search_match',
                advertisement=ad,
            ).exists()
        )

    def test_match_helper_respects_filters_json(self):
        self.saved_search.filters = {'cargo_category': 'food'}
        self.saved_search.save(update_fields=['filters'])
        ad = self._create_ad(cargo_category='general')
        self.assertFalse(advertisement_matches_saved_search(ad, self.saved_search))
        ad.cargo_category = 'food'
        self.assertTrue(advertisement_matches_saved_search(ad, self.saved_search))

    def test_notify_sends_to_driver_without_expired_docs(self):
        from apps.advertisements.saved_search_alerts import notify_saved_search_matches

        ad = self._create_ad()
        Notification.objects.filter(advertisement=ad).delete()
        self.assertEqual(notify_saved_search_matches(ad), 1)
        self.assertTrue(
            Notification.objects.filter(
                user=self.driver_user,
                notification_type='saved_search_match',
                advertisement=ad,
            ).exists()
        )

    def test_notify_skips_driver_with_expired_documents(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.advertisements.saved_search_alerts import notify_saved_search_matches
        from apps.users.models import DriverDocument

        DriverDocument.objects.create(
            user=self.driver_user,
            document_type=DriverDocument.DOC_TYPE_DRIVER_LICENSE,
            expires_at=timezone.now().date() - timedelta(days=2),
            is_active=True,
        )
        ad = self._create_ad()
        Notification.objects.filter(advertisement=ad).delete()
        self.assertEqual(notify_saved_search_matches(ad), 0)
