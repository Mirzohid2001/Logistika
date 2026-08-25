from django.contrib.auth.models import AnonymousUser
from django.test import TestCase
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from apps.advertisements.models import Advertisement
from apps.advertisements.serializers import AdvertisementDetailSerializer
from apps.locations.models import City, Country
from apps.users.models import User


class AdvertisementPrivateDetailsTests(TestCase):
    def setUp(self):
        self.owner = User.objects.create_user(
            phone='998901230001',
            password='owner-password',
            is_client=True,
        )
        country = Country.objects.create(
            code='TST',
            name_ru='Тест',
            name_en='Test',
            name_uz='Test',
        )
        departure = City.objects.create(
            country=country,
            name_ru='Отправление',
            name_en='Departure',
            name_uz='Jo\'nash',
        )
        destination = City.objects.create(
            country=country,
            name_ru='Назначение',
            name_en='Destination',
            name_uz='Manzil',
        )
        self.advertisement = Advertisement.objects.create(
            client=self.owner,
            title_ru='Груз',
            title_en='Cargo',
            title_uz='Yuk',
            weight=100,
            departure_city=departure,
            departure_address='Точный адрес отправления',
            destination_city=destination,
            destination_address='Точный адрес назначения',
            contact_name='Отправитель',
            contact_phone='+998901111111',
            receiver_name='Получатель',
            receiver_phone='+998902222222',
            route_stops=[{'address': 'Склад'}],
        )
        self.factory = APIRequestFactory()

    def _serialize_for(self, user):
        request = Request(self.factory.get('/api/advertisements/1/'))
        request._user = user
        return AdvertisementDetailSerializer(
            self.advertisement,
            context={'request': request},
        ).data

    def test_anonymous_user_cannot_see_contacts_or_exact_route(self):
        data = self._serialize_for(AnonymousUser())

        self.assertFalse(data['private_details_visible'])
        for field_name in AdvertisementDetailSerializer.PRIVATE_FIELDS:
            self.assertNotIn(field_name, data)

    def test_owner_can_see_private_details(self):
        data = self._serialize_for(self.owner)

        self.assertTrue(data['private_details_visible'])
        self.assertEqual(data['contact_phone'], '+998901111111')
        self.assertEqual(data['departure_address'], 'Точный адрес отправления')
