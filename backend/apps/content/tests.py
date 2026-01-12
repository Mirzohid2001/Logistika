from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from .models import StaticContent


class StaticContentModelTest(TestCase):
    def setUp(self):
        self.content = StaticContent.objects.create(
            content_type='public_offer',
            content_ru='Публичная оферта на русском',
            content_en='Public offer in English',
            content_uz='Ommaviy oferta o\'zbek tilida'
        )

    def test_content_creation(self):
        self.assertEqual(self.content.content_type, 'public_offer')
        self.assertEqual(self.content.content_ru, 'Публичная оферта на русском')


class StaticContentAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.public_offer = StaticContent.objects.create(
            content_type='public_offer',
            content_ru='Публичная оферта на русском',
            content_en='Public offer in English',
            content_uz='Ommaviy oferta o\'zbek tilida'
        )
        self.disclaimer = StaticContent.objects.create(
            content_type='disclaimer',
            content_ru='Отказ от ответственности на русском',
            content_en='Disclaimer in English',
            content_uz='Mas\'uliyatdan voz kechish o\'zbek tilida'
        )

    def test_get_public_offer(self):
        url = '/api/content/public-offer/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content_type'], 'public_offer')
        self.assertIn('content', response.data)

    def test_get_disclaimer(self):
        url = '/api/content/disclaimer/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content_type'], 'disclaimer')
        self.assertIn('content', response.data)

    def test_content_language_support_ru(self):
        url = '/api/content/public-offer/?lang=ru'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content'], 'Публичная оферта на русском')

    def test_content_language_support_en(self):
        url = '/api/content/public-offer/?lang=en'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content'], 'Public offer in English')

    def test_content_language_support_uz(self):
        url = '/api/content/public-offer/?lang=uz'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['content'], 'Ommaviy oferta o\'zbek tilida')
