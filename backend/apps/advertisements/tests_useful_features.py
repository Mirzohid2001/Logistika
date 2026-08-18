from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.advertisements.backhaul import get_backhaul_matches
from apps.advertisements.load_fit import check_driver_load_fit
from apps.advertisements.market_insight import get_lane_price_insight
from apps.advertisements.market_signal import get_duplicate_risk, get_route_health
from apps.advertisements.models import Advertisement
from apps.advertisements.trip_estimate import estimate_trip_profit
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderStatus
from apps.vehicles.models import Vehicle

User = get_user_model()


def auth_client(client: APIClient, user) -> APIClient:
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


class UsefulFeaturesTest(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'UZ'},
        )
        self.city_a = City.objects.create(country=self.country, name_ru='A2', name_en='A2', name_uz='A2')
        self.city_b = City.objects.create(country=self.country, name_ru='B2', name_en='B2', name_uz='B2')
        self.client_user = User.objects.create_user(phone='+998901113344', password='pass12345', is_client=True)
        self.driver = User.objects.create_user(phone='+998901113355', password='pass12345', is_driver=True)
        self.status_completed = OrderStatus.objects.get(code='completed')

    def test_trip_profit_estimate(self):
        payload = estimate_trip_profit(self.city_a.id, self.city_b.id, Decimal('1000000'))
        self.assertIn('net_profit', payload)
        self.assertGreater(payload['estimated_distance_km'], 0)

    def test_load_fit(self):
        Vehicle.objects.create(
            user=self.driver,
            make='MAN',
            model='TGX',
            number='01A111AA',
            cargo_volume=80,
            load_capacity=Decimal('20000'),
            verification_status='approved',
        )
        fit = check_driver_load_fit(self.driver, Decimal('5000'))
        self.assertTrue(fit['fits'])

    def test_reorder_from_completed_order(self):
        route_stops = [
            {'sequence': 1, 'stop_type': 'pickup', 'label': 'Pickup', 'address': 'addr A'},
            {'sequence': 2, 'stop_type': 'delivery', 'label': 'Mid', 'address': 'addr mid'},
            {'sequence': 3, 'stop_type': 'delivery', 'label': 'Delivery', 'address': 'addr B'},
        ]
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test',
            title_en='Test',
            title_uz='Test',
            weight=Decimal('1000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('500000'),
            route_stops=route_stops,
        )
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
        )
        api = auth_client(APIClient(), self.client_user)
        response = api.post(f'/api/advertisements/reorder-from-order/{order.id}/')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('(qayta)', response.data['title'])
        new_ad = Advertisement.objects.order_by('-id').first()
        self.assertEqual(len(new_ad.route_stops), 3)
        self.assertEqual(new_ad.route_stops[1]['address'], 'addr mid')

    def test_trip_estimate_endpoint(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test',
            title_en='Test',
            title_uz='Test',
            weight=Decimal('1000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('500000'),
        )
        api = auth_client(APIClient(), self.driver)
        response = api.get(f'/api/advertisements/{ad.id}/trip-estimate/', {'amount': '500000'})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('net_profit', response.data)

    def test_route_health_endpoint(self):
        Advertisement.objects.create(
            client=self.client_user,
            title_ru='Insight route',
            title_en='Insight route',
            title_uz='Insight route',
            weight=Decimal('3200'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('550000'),
        )
        api = auth_client(APIClient(), self.client_user)
        response = api.get(
            '/api/advertisements/route-health/',
            {'from_city': self.city_a.id, 'to_city': self.city_b.id, 'weight': '3000'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('competition_level', response.data)
        self.assertIn('recent_posts_7d', response.data)

    def test_duplicate_risk_endpoint(self):
        Advertisement.objects.create(
            client=self.client_user,
            title_ru='Old duplicate',
            title_en='Old duplicate',
            title_uz='Old duplicate',
            weight=Decimal('3000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('600000'),
        )
        api = auth_client(APIClient(), self.client_user)
        response = api.get(
            '/api/advertisements/duplicate-risk/',
            {
                'from_city': self.city_a.id,
                'to_city': self.city_b.id,
                'weight': '3050',
                'proposed_cost': '620000',
            },
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('risk_level', response.data)
        self.assertGreaterEqual(response.data['matches_count'], 1)

    def test_route_health_unit_competition_and_recommendation(self):
        for _ in range(26):
            Advertisement.objects.create(
                client=self.client_user,
                title_ru='Crowded lane',
                title_en='Crowded lane',
                title_uz='Crowded lane',
                weight=Decimal('3000'),
                departure_city=self.city_a,
                departure_address='addr',
                destination_city=self.city_b,
                destination_address='addr',
                proposed_cost=Decimal('500000'),
            )
        health = get_route_health(self.city_a.id, self.city_b.id, Decimal('3000'))
        self.assertEqual(health['competition_level'], 'high')
        self.assertEqual(health['recent_posts_7d'], 26)
        self.assertIn('recommendation', health)

    def test_route_health_favorable_recommendation(self):
        for i in range(6):
            ad = Advertisement.objects.create(
                client=self.client_user,
                title_ru=f'Completed lane {i}',
                title_en=f'Completed lane {i}',
                title_uz=f'Completed lane {i}',
                weight=Decimal('3000'),
                departure_city=self.city_a,
                departure_address='addr',
                destination_city=self.city_b,
                destination_address='addr',
                proposed_cost=Decimal('500000'),
            )
            Order.objects.create(
                advertisement=ad,
                driver=self.driver,
                client=self.client_user,
                status=self.status_completed,
                completed_at=timezone.now(),
            )
        health = get_route_health(self.city_a.id, self.city_b.id, Decimal('3000'))
        self.assertEqual(health['competition_level'], 'low')
        self.assertGreaterEqual(health['completed_orders_30d'], 5)
        self.assertEqual(health['recommendation'], 'favorable')

    def test_duplicate_risk_high_with_many_matches(self):
        for i in range(5):
            Advertisement.objects.create(
                client=self.client_user,
                title_ru=f'Dup {i}',
                title_en=f'Dup {i}',
                title_uz=f'Dup {i}',
                weight=Decimal('3000'),
                departure_city=self.city_a,
                departure_address='addr',
                destination_city=self.city_b,
                destination_address='addr',
                proposed_cost=Decimal('600000'),
            )
        risk = get_duplicate_risk(
            self.client_user,
            self.city_a.id,
            self.city_b.id,
            Decimal('3050'),
            Decimal('620000'),
        )
        self.assertEqual(risk['risk_level'], 'high')
        self.assertTrue(risk['should_delay'])
        self.assertFalse(risk['should_review'])

    def test_duplicate_risk_ignores_different_route(self):
        city_c = City.objects.create(country=self.country, name_ru='C2', name_en='C2', name_uz='C2')
        Advertisement.objects.create(
            client=self.client_user,
            title_ru='Other route',
            title_en='Other route',
            title_uz='Other route',
            weight=Decimal('3000'),
            departure_city=self.city_b,
            departure_address='addr',
            destination_city=city_c,
            destination_address='addr',
            proposed_cost=Decimal('600000'),
        )
        risk = get_duplicate_risk(
            self.client_user,
            self.city_a.id,
            self.city_b.id,
            Decimal('3050'),
            Decimal('620000'),
        )
        self.assertEqual(risk['matches_count'], 0)
        self.assertEqual(risk['risk_level'], 'low')

    def test_load_fit_overweight(self):
        Vehicle.objects.create(
            user=self.driver,
            make='KAMAZ',
            model='65115',
            number='01B222BB',
            cargo_volume=40,
            load_capacity=Decimal('5000'),
            verification_status='approved',
        )
        fit = check_driver_load_fit(self.driver, Decimal('12000'))
        self.assertFalse(fit['fits'])
        self.assertEqual(fit['reason'], 'overweight')
        self.assertIsNotNone(fit['best_vehicle'])

    def test_load_fit_overvolume(self):
        Vehicle.objects.create(
            user=self.driver,
            make='Isuzu',
            model='NQR',
            number='01C333CC',
            cargo_volume=Decimal('10'),
            load_capacity=Decimal('8000'),
            verification_status='approved',
        )
        fit = check_driver_load_fit(self.driver, Decimal('2000'), Decimal('25'))
        self.assertFalse(fit['fits'])
        self.assertEqual(fit['reason'], 'overvolume')

    def test_load_fit_no_vehicle(self):
        empty_driver = User.objects.create_user(phone='+998901113366', password='pass12345', is_driver=True)
        fit = check_driver_load_fit(empty_driver, Decimal('1000'))
        self.assertFalse(fit['fits'])
        self.assertEqual(fit['reason'], 'no_vehicle')

    def test_trip_profit_unprofitable_low_revenue(self):
        payload = estimate_trip_profit(self.city_a.id, self.city_b.id, Decimal('10000'))
        self.assertFalse(payload['is_profitable'])
        self.assertLess(payload['net_profit'], 0)

    def test_lane_price_insight_weight_bucket(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Heavy lane',
            title_en='Heavy lane',
            title_uz='Heavy lane',
            weight=Decimal('8000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('900000'),
        )
        Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
        )
        insight = get_lane_price_insight(self.city_a.id, self.city_b.id, Decimal('8200'))
        self.assertTrue(insight['available'])
        self.assertGreaterEqual(insight['sample_count'], 1)

    def test_backhaul_no_anchor_without_orders(self):
        fresh_driver = User.objects.create_user(phone='+998901113377', password='pass12345', is_driver=True)
        payload = get_backhaul_matches(fresh_driver)
        self.assertFalse(payload['available'])
        self.assertEqual(payload['matches'], [])

    def test_backhaul_from_completed_destination(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Return load source',
            title_en='Return load source',
            title_uz='Return load source',
            weight=Decimal('2000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('400000'),
        )
        Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
            completed_at=timezone.now(),
        )
        return_ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Return match',
            title_en='Return match',
            title_uz='Return match',
            weight=Decimal('1500'),
            departure_city=self.city_b,
            departure_address='addr',
            destination_city=self.city_a,
            destination_address='addr',
            proposed_cost=Decimal('350000'),
        )
        payload = get_backhaul_matches(self.driver)
        self.assertTrue(payload['available'])
        self.assertEqual(payload['anchor_reason'], 'last_destination')
        self.assertEqual(payload['matches'][0]['advertisement_id'], return_ad.id)
