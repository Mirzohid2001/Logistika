from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.advertisements.market_insight import get_lane_price_insight
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderCustodyEvent, OrderStatus
from apps.advertisements.models import Advertisement
from apps.ratings.models import Complaint, Rating
from apps.users.trust import _tier_for_score, compute_user_trust

User = get_user_model()


def auth_client(client: APIClient, user) -> APIClient:
    token = str(RefreshToken.for_user(user).access_token)
    client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    return client


class DifferentiatingFeaturesTest(TestCase):
    def setUp(self):
        self.client_api = APIClient()
        self.country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'UZ'},
        )
        self.city_a = City.objects.create(country=self.country, name_ru='A', name_en='A', name_uz='A')
        self.city_b = City.objects.create(country=self.country, name_ru='B', name_en='B', name_uz='B')
        self.client_user = User.objects.create_user(phone='+998901112233', password='pass12345', is_client=True)
        self.driver = User.objects.create_user(phone='+998901112244', password='pass12345', is_driver=True)
        self.dispatcher = User.objects.create_user(
            phone='+998901112255', password='pass12345', is_dispatcher=True
        )
        self.status_completed = OrderStatus.objects.get(code='completed')
        self.status_in_transit = OrderStatus.objects.get(code='in_transit')

    def test_lane_price_insight_empty(self):
        payload = get_lane_price_insight(self.city_a.id, self.city_b.id, Decimal('1000'))
        self.assertFalse(payload['available'])

    def test_lane_price_insight_with_history(self):
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
        Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
        )
        payload = get_lane_price_insight(self.city_a.id, self.city_b.id, Decimal('1000'))
        self.assertTrue(payload['available'])
        self.assertGreaterEqual(payload['sample_count'], 1)

    def test_price_insight_endpoint(self):
        auth_client(self.client_api, self.client_user)
        response = self.client_api.get(
            '/api/advertisements/price-insight/',
            {'from_city': self.city_a.id, 'to_city': self.city_b.id, 'weight': '1000'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_trust_score_defaults(self):
        payload = compute_user_trust(self.driver)
        self.assertIn('trust_score', payload)
        self.assertIn(payload['trust_tier'], ('bronze', 'silver', 'gold', 'platinum'))

    def test_driver_sos_flow(self):
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
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_in_transit,
        )
        driver_client = auth_client(APIClient(), self.driver)
        response = driver_client.post(
            f'/api/orders/{order.id}/sos/',
            {'lat': '41.2995', 'lng': '69.2401', 'message': 'Help'},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['status'], 'active')

        dispatcher_client = auth_client(APIClient(), self.dispatcher)
        ack = dispatcher_client.post(f'/api/orders/{order.id}/sos/acknowledge/')
        self.assertEqual(ack.status_code, status.HTTP_200_OK)
        self.assertEqual(ack.data['status'], 'acknowledged')

    def test_custody_event_on_pod(self):
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
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_in_transit,
        )
        from apps.orders.models import OrderRouteStop
        from apps.orders.route_stops import ensure_default_route_stops

        ensure_default_route_stops(order)
        delivery = order.route_stops.filter(stop_type=OrderRouteStop.STOP_DELIVERY).last()
        delivery.lat = Decimal('41.2995')
        delivery.lng = Decimal('69.2401')
        delivery.status = OrderRouteStop.STATUS_ARRIVED
        delivery.save(update_fields=['lat', 'lng', 'status'])
        driver_client = auth_client(APIClient(), self.driver)
        png = (
            b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x08'
            b'\x00\x00\x00\x08\x08\x02\x00\x00\x00Km)\xdc\x00\x00'
            b'\x00\x14IDATx\x9cc\x14\tX\xc0\x80\r0a\x15\x1d\xb4\x12'
            b'\x00\xcf\x94\x01\x14\xcb\xbd\xc6M\x00\x00\x00\x00IEND\xaeB`\x82'
        )
        response = driver_client.post(
            f'/api/orders/{order.id}/proof-of-delivery/',
            {
                'receiver_name': 'Ali',
                'receiver_signature': 'Ali',
                'delivered_lat': '41.2995',
                'delivered_lng': '69.2401',
                'delivery_photo': SimpleUploadedFile('pod.png', png, content_type='image/png'),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(
            OrderCustodyEvent.objects.filter(
                order=order,
                event_type=OrderCustodyEvent.EVENT_DELIVERY,
            ).exists()
        )

    def test_trust_tier_boundaries(self):
        self.assertEqual(_tier_for_score(95), 'platinum')
        self.assertEqual(_tier_for_score(90), 'platinum')
        self.assertEqual(_tier_for_score(75), 'gold')
        self.assertEqual(_tier_for_score(55), 'silver')
        self.assertEqual(_tier_for_score(20), 'bronze')

    def test_trust_score_with_ratings_and_orders(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Trust lane',
            title_en='Trust lane',
            title_uz='Trust lane',
            weight=Decimal('1000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('500000'),
        )
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
        )
        for i in range(3):
            extra_ad = Advertisement.objects.create(
                client=self.client_user,
                title_ru=f'Trust lane {i}',
                title_en=f'Trust lane {i}',
                title_uz=f'Trust lane {i}',
                weight=Decimal('1000'),
                departure_city=self.city_a,
                departure_address='addr',
                destination_city=self.city_b,
                destination_address='addr',
                proposed_cost=Decimal('500000'),
            )
            extra_order = Order.objects.create(
                advertisement=extra_ad,
                driver=self.driver,
                client=self.client_user,
                status=self.status_completed,
            )
            Rating.objects.create(
                from_user=self.client_user,
                to_user=self.driver,
                order=extra_order,
                rating=5,
                comment=f'Great {i}',
            )
        payload = compute_user_trust(self.driver)
        self.assertGreaterEqual(payload['trust_score'], 50)
        self.assertEqual(payload['trust_breakdown']['total_ratings'], 3)
        self.assertGreaterEqual(payload['trust_breakdown']['completed_orders'], 3)

    def test_trust_penalized_by_complaints(self):
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Complaint lane',
            title_en='Complaint lane',
            title_uz='Complaint lane',
            weight=Decimal('1000'),
            departure_city=self.city_a,
            departure_address='addr',
            destination_city=self.city_b,
            destination_address='addr',
            proposed_cost=Decimal('500000'),
        )
        order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=self.status_completed,
        )
        Complaint.objects.create(
            from_user=self.client_user,
            to_user=self.driver,
            order=order,
            category='communication',
            description='Driver was late to pickup',
            status='pending',
        )
        baseline = compute_user_trust(self.driver)['trust_score']
        Complaint.objects.create(
            from_user=self.client_user,
            to_user=self.driver,
            order=order,
            category='cargo_damage',
            description='Minor cargo damage reported',
            status='in_review',
        )
        penalized = compute_user_trust(self.driver)['trust_score']
        self.assertLess(penalized, baseline)
        self.assertEqual(compute_user_trust(self.driver)['trust_breakdown']['pending_complaints'], 2)
