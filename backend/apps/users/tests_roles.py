from django.contrib.auth import get_user_model
from django.test import TestCase

from .roles import (
    get_marketplace_role,
    is_marketplace_client,
    is_marketplace_driver,
    normalize_registration_roles,
    requires_subscription,
)

User = get_user_model()


class MarketplaceRolesTest(TestCase):
    def test_registration_normalizes_roles(self):
        roles = normalize_registration_roles(is_driver=True)
        self.assertTrue(roles['is_driver'])
        self.assertFalse(roles['is_client'])

        roles = normalize_registration_roles(is_driver=False)
        self.assertFalse(roles['is_driver'])
        self.assertTrue(roles['is_client'])

    def test_driver_role(self):
        user = User.objects.create_user(
            phone='998901240101',
            password='testpass123',
            first_name='D',
            last_name='R',
            is_driver=True,
            is_client=False,
        )
        self.assertEqual(get_marketplace_role(user), 'driver')
        self.assertTrue(is_marketplace_driver(user))
        self.assertFalse(is_marketplace_client(user))
        self.assertTrue(requires_subscription(user))

    def test_client_role(self):
        user = User.objects.create_user(
            phone='998901240102',
            password='testpass123',
            first_name='C',
            last_name='L',
            is_driver=False,
            is_client=True,
        )
        self.assertEqual(get_marketplace_role(user), 'client')
        self.assertTrue(requires_subscription(user))

    def test_dispatcher_skips_subscription(self):
        user = User.objects.create_user(
            phone='998901240103',
            password='testpass123',
            first_name='Disp',
            last_name='A',
            is_dispatcher=True,
        )
        self.assertIsNone(get_marketplace_role(user))
        self.assertFalse(requires_subscription(user))
