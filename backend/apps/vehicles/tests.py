from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status

from apps.users.models import User
from apps.vehicles.models import Vehicle


class VehicleApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.driver = User.objects.create_user(
            phone='998901112233',
            password='testpass123',
            first_name='Driver',
            last_name='Test',
            is_driver=True,
        )
        self.client_user = User.objects.create_user(
            phone='998904445566',
            password='testpass123',
            first_name='Client',
            last_name='Test',
            is_client=True,
        )

    def test_driver_can_create_vehicle(self):
        self.client.force_authenticate(user=self.driver)
        response = self.client.post(
            '/api/users/vehicles/',
            {
                'make': 'MAN',
                'model': 'TGX',
                'number': '01A123BC',
                'cargo_volume': '90.00',
                'load_capacity': '20000.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(Vehicle.objects.filter(user=self.driver).count(), 1)
        self.assertEqual(response.data['number'], '01A123BC')

    def test_client_cannot_create_vehicle(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            '/api/users/vehicles/',
            {
                'make': 'MAN',
                'model': 'TGX',
                'number': '01A999ZZ',
                'cargo_volume': '90.00',
                'load_capacity': '20000.00',
            },
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_driver_can_list_vehicles(self):
        Vehicle.objects.create(
            user=self.driver,
            make='Isuzu',
            model='NQR',
            number='10B777CC',
            cargo_volume=45,
            load_capacity=10000,
        )
        self.client.force_authenticate(user=self.driver)
        response = self.client.get('/api/users/vehicles/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
