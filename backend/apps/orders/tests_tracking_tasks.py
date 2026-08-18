from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.models import Order, OrderLocationTrack, OrderStatus
from apps.orders.services import orders_eligible_for_tracking
from apps.orders.tasks import update_active_order_locations
from apps.users.models import User


class TrackingTasksTest(TestCase):
    def setUp(self):
        self.country = Country.objects.create(
            name_ru='UZ',
            name_en='UZ',
            name_uz='UZ',
            code='TZ',
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Tashkent',
            name_en='Tashkent',
            name_uz='Toshkent',
        )
        self.client_user = User.objects.create_user(phone='998907770001', password='pass')
        self.driver = User.objects.create_user(
            phone='998907770002',
            password='pass',
            is_driver=True,
        )
        self.ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Task',
            title_en='Task',
            title_uz='Task',
            weight=Decimal('100'),
            departure_city=self.city,
            departure_address='A',
            destination_city=self.city,
            destination_address='B',
        )

    def _create_order(self, status_code: str) -> Order:
        status = OrderStatus.objects.get(code=status_code)
        return Order.objects.create(
            advertisement=self.ad,
            driver=self.driver,
            client=self.client_user,
            status=status,
            current_location_lat=Decimal('41.311100'),
            current_location_lng=Decimal('69.279700'),
        )

    def test_orders_eligible_for_tracking_includes_in_transit(self):
        in_progress = self._create_order('in_progress')
        in_transit = self._create_order('in_transit')
        completed = self._create_order('completed')

        eligible_ids = set(orders_eligible_for_tracking().values_list('id', flat=True))
        self.assertIn(in_progress.id, eligible_ids)
        self.assertIn(in_transit.id, eligible_ids)
        self.assertNotIn(completed.id, eligible_ids)

    def test_update_active_order_locations_writes_track_for_in_transit(self):
        order = self._create_order('in_transit')
        update_active_order_locations()
        self.assertTrue(OrderLocationTrack.objects.filter(order=order).exists())
