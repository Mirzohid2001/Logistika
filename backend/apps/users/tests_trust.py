from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.users.serializers import UserReputationSerializer
from apps.users.trust import compute_user_trust, get_user_trust, prepare_client_reputations

User = get_user_model()


class TrustCacheTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone='998906660001', password='pass', is_driver=True)

    @patch('apps.users.trust.compute_user_trust')
    def test_get_user_trust_reuses_cache(self, mock_compute):
        mock_compute.return_value = {
            'trust_score': 80,
            'trust_tier': 'gold',
            'trust_breakdown': {},
        }
        cache = {}
        get_user_trust(self.user, cache)
        get_user_trust(self.user, cache)
        mock_compute.assert_called_once()

    @patch('apps.users.trust.compute_user_trust')
    def test_reputation_serializer_reuses_trust_compute(self, mock_compute):
        mock_compute.return_value = {
            'trust_score': 70,
            'trust_tier': 'silver',
            'trust_breakdown': {},
        }
        serializer = UserReputationSerializer(self.user)
        self.assertEqual(serializer.data['trust_score'], 70)
        self.assertEqual(serializer.data['trust_tier'], 'silver')
        mock_compute.assert_called_once()


class TrustScoringTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(phone='998906660002', password='pass', is_driver=True)
        self.client_user = User.objects.create_user(phone='998906660003', password='pass')
        self.country = Country.objects.create(name_ru='UZ', name_en='UZ', name_uz='UZ', code='TR1')
        self.city = City.objects.create(country=self.country, name_ru='Tashkent', name_en='Tashkent', name_uz='Toshkent')
        self.completed_status, _ = OrderStatus.objects.get_or_create(
            code='completed',
            defaults={'name_ru': 'Completed', 'name_en': 'Completed', 'name_uz': 'Completed'},
        )

    def _create_completed_order(self, *, with_deadline: bool):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Trust',
            title_en='Trust',
            title_uz='Trust',
            weight=100,
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
            delivery_deadline=timezone.now() + timedelta(days=1) if with_deadline else None,
        )
        return Order.objects.create(
            advertisement=ad,
            driver=self.user,
            client=self.client_user,
            status=self.completed_status,
            completed_at=timezone.now(),
        )

    def test_on_time_rate_ignores_orders_without_deadline(self):
        self._create_completed_order(with_deadline=False)
        self._create_completed_order(with_deadline=True)

        trust = compute_user_trust(self.user)
        self.assertEqual(trust['trust_breakdown']['completed_orders'], 2)
        self.assertEqual(trust['trust_breakdown']['on_time_rate'], 1.0)

    def test_bulk_client_trust_matches_individual_calculation(self):
        self._create_completed_order(with_deadline=False)
        self._create_completed_order(with_deadline=True)

        reputation_cache, trust_cache = prepare_client_reputations([self.client_user])
        individual = compute_user_trust(self.client_user)

        self.assertEqual(trust_cache[self.client_user.id], individual)
        self.assertEqual(reputation_cache[self.client_user.id]['total_ratings'], 0)
