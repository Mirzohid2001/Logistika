from django.test import SimpleTestCase

from apps.payments.checkout import extract_checkout_url


class CheckoutUrlExtractionTests(SimpleTestCase):
    def test_top_level_payment_url(self):
        self.assertEqual(
            extract_checkout_url({'payment_url': 'https://pay.example/checkout'}),
            'https://pay.example/checkout',
        )

    def test_nested_result_url(self):
        payload = {'result': {'checkout_url': 'https://gateway.test/pay/1'}}
        self.assertEqual(extract_checkout_url(payload), 'https://gateway.test/pay/1')

    def test_invalid_payload_returns_none(self):
        self.assertIsNone(extract_checkout_url(None))
        self.assertIsNone(extract_checkout_url({'status': 'ok'}))
