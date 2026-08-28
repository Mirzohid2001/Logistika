from django.test import Client, TestCase, override_settings
from unittest.mock import patch


@override_settings(
    SECRET_KEY='test-secret',
    CELERY_BROKER_URL='redis://127.0.0.1:6379/0',
)
class HealthEndpointTest(TestCase):
    def setUp(self):
        self.client = Client()

    def test_health_returns_ok(self):
        response = self.client.get('/health/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'ok')

    @patch('apps.common.health_views._check_redis', return_value={'ok': True})
    def test_ready_returns_ready_when_dependencies_ok(self, _redis_check):
        response = self.client.get('/ready/')
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertEqual(payload['status'], 'ready')
        self.assertEqual(payload['checks']['db'], 'ok')
        self.assertEqual(payload['checks']['cache'], 'ok')
        self.assertEqual(payload['checks']['broker'], 'ok')
