from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework import status
from django.utils import timezone
from datetime import date
from .models import News


class NewsModelTest(TestCase):
    def setUp(self):
        self.news = News.objects.create(
            title_ru='Тестовая новость',
            title_en='Test News',
            title_uz='Test yangilik',
            text_ru='Текст новости на русском',
            text_en='News text in English',
            text_uz='Yangilik matni o\'zbek tilida',
            date=date.today()
        )

    def test_news_creation(self):
        self.assertEqual(self.news.title_ru, 'Тестовая новость')
        self.assertEqual(self.news.title_en, 'Test News')
        self.assertEqual(self.news.title_uz, 'Test yangilik')


class NewsAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.news = News.objects.create(
            title_ru='Тестовая новость',
            title_en='Test News',
            title_uz='Test yangilik',
            text_ru='Текст новости на русском',
            text_en='News text in English',
            text_uz='Yangilik matni o\'zbek tilida',
            date=date.today()
        )

    def test_get_news_list(self):
        url = '/api/news/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data), 1)
        self.assertIn('title', response.data[0])

    def test_get_news_detail(self):
        url = f'/api/news/{self.news.id}/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('title', response.data)
        self.assertIn('text', response.data)

    def test_news_language_support_ru(self):
        url = f'/api/news/{self.news.id}/?lang=ru'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Тестовая новость')
        self.assertEqual(response.data['text'], 'Текст новости на русском')

    def test_news_language_support_en(self):
        url = f'/api/news/{self.news.id}/?lang=en'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test News')
        self.assertEqual(response.data['text'], 'News text in English')

    def test_news_language_support_uz(self):
        url = f'/api/news/{self.news.id}/?lang=uz'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test yangilik')
        self.assertEqual(response.data['text'], 'Yangilik matni o\'zbek tilida')
