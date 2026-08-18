from decimal import Decimal

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.advertisements.models import Advertisement
from apps.locations.models import City, Country
from apps.orders.amount_words import amount_in_words_uz
from apps.orders.document_pdf import resolve_pdf_font
from apps.orders.documents import ensure_order_documents
from apps.orders.models import Order, OrderStatus
from apps.users.models import Company
from apps.vehicles.models import Vehicle

User = get_user_model()


class OrderDocumentTests(TestCase):
    def setUp(self):
        self.api = APIClient()
        self.client_user = User.objects.create_user(
            phone='998909110001',
            password='pass',
            first_name='Mijoz',
            last_name='Firma',
            is_client=True,
            company_inn='123456789',
        )
        Company.objects.get_or_create(
            inn='123456789',
            defaults={
                'name': 'Logi Trade MCHJ',
                'address': 'Toshkent, Yunusobod',
                'director_name': 'Karimov A.',
                'bank_name': 'NBU',
                'bank_account': '20208000012345678901',
                'mfo': '00014',
            },
        )
        self.driver = User.objects.create_user(
            phone='998909110002',
            password='pass',
            first_name='Ali',
            last_name='Haydovchi',
            is_driver=True,
        )
        self.stranger = User.objects.create_user(
            phone='998909110003',
            password='pass',
            first_name='Boshqa',
            last_name='User',
        )
        Vehicle.objects.create(
            user=self.driver,
            make='Isuzu',
            model='NPR',
            number='01DOC123BC',
            cargo_volume=40,
            load_capacity=5000,
        )
        country, _ = Country.objects.get_or_create(
            code='UZ',
            defaults={'name_ru': 'UZ', 'name_en': 'UZ', 'name_uz': 'O\'zbekiston'},
        )
        self.city_a = City.objects.create(country=country, name_ru='Tashkent', name_en='Tashkent', name_uz='Toshkent')
        self.city_b = City.objects.create(country=country, name_ru='Samarkand', name_en='Samarkand', name_uz='Samarqand')
        ad = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Цемент',
            title_en='Cement',
            title_uz='Sement',
            weight=Decimal('12000'),
            departure_city=self.city_a,
            departure_address='Sergeli ombor',
            destination_city=self.city_b,
            destination_address='Siyob bozor',
            proposed_cost=Decimal('1500000'),
            receiver_name='Qabulchi',
        )
        self.order = Order.objects.create(
            advertisement=ad,
            driver=self.driver,
            client=self.client_user,
            status=OrderStatus.objects.get(code='completed'),
            agreed_amount=Decimal('1500000'),
        )

    def test_amount_in_words(self):
        self.assertEqual(amount_in_words_uz('0'), "Nol so'm 00 tiyin")
        self.assertIn("o'n bir", amount_in_words_uz('11').lower())
        self.assertIn('million', amount_in_words_uz('1500000').lower())
        self.assertIn("so'm", amount_in_words_uz('1500000'))
        self.assertIn('50 tiyin', amount_in_words_uz('10.50'))

    def test_generate_creates_invoice_ttn_cmr_and_act(self):
        docs = ensure_order_documents(self.order)
        types = {doc.doc_type for doc in docs}
        self.assertEqual(types, {'invoice', 'ttn', 'cmr', 'act'})

        invoice = next(doc for doc in docs if doc.doc_type == 'invoice')
        html = invoice.html_file.read().decode('utf-8')
        self.assertIn('SF-000', invoice.number)
        self.assertIn('Hisob-faktura', html)
        self.assertIn('123456789', html)
        self.assertIn('1 500 000', html)
        self.assertIn('Toshkent', html)
        self.assertIn('Logi Trade', html)
        self.assertIn('NBU', html)
        self.assertIn('Bir million', html)
        self.assertIn('tiyin', html)
        xlsx = invoice.xlsx_file.read()
        self.assertEqual(xlsx[:2], b'PK')
        if resolve_pdf_font():
            self.assertTrue(invoice.pdf_file)
            self.assertEqual(invoice.pdf_file.read()[:4], b'%PDF')

        ttn = next(doc for doc in docs if doc.doc_type == 'ttn')
        ttn_html = ttn.html_file.read().decode('utf-8')
        self.assertIn('Tovar-transport yuk xati', ttn_html)
        self.assertIn('Qabulchi', ttn_html)
        self.assertIn('01DOC123BC', ttn_html)

        cmr = next(doc for doc in docs if doc.doc_type == 'cmr')
        cmr_html = cmr.html_file.read().decode('utf-8')
        self.assertIn('CMR', cmr_html)
        self.assertIn('Sender', cmr_html)
        self.assertIn('Consignee', cmr_html)

        act = next(doc for doc in docs if doc.doc_type == 'act')
        act_html = act.html_file.read().decode('utf-8')
        self.assertIn('dalolatnoma', act_html.lower())
        self.assertIn('Avtomobil transportida yuk tashish', act_html)

    def test_api_generate_and_public_download(self):
        self.api.force_authenticate(user=self.client_user)
        response = self.api.post(f'/api/orders/{self.order.id}/documents/generate/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['documents']), 4)
        invoice = next(item for item in response.data['documents'] if item['doc_type'] == 'invoice')
        cmr = next(item for item in response.data['documents'] if item['doc_type'] == 'cmr')
        self.assertTrue(invoice['html_url'])
        self.assertTrue(cmr['xlsx_url'])

        html = self.api.get(f'/api/orders/{self.order.id}/documents/invoice/')
        self.assertEqual(html.status_code, 200)
        self.assertIn('Hisob-faktura', html.content.decode('utf-8'))

        ttn_xlsx = self.api.get(f'/api/orders/{self.order.id}/documents/ttn/?file=xlsx')
        self.assertEqual(ttn_xlsx.status_code, 200)
        payload = b''.join(ttn_xlsx.streaming_content)
        self.assertEqual(payload[:2], b'PK')

        cmr_html = self.api.get(f'/api/orders/{self.order.id}/documents/cmr/')
        self.assertEqual(cmr_html.status_code, 200)
        self.assertIn('CMR', cmr_html.content.decode('utf-8'))

        if resolve_pdf_font():
            self.assertTrue(invoice['has_pdf'])
            pdf = self.api.get(f'/api/orders/{self.order.id}/documents/invoice/?file=pdf')
            self.assertEqual(pdf.status_code, 200)
            pdf_body = b''.join(pdf.streaming_content)
            self.assertEqual(pdf_body[:4], b'%PDF')

        public = self.api.get(f'/api/orders/documents/public/{invoice["token"]}/')
        self.assertEqual(public.status_code, 200)
        self.assertIn('Logi Trade', public.content.decode('utf-8'))

        detail = self.api.get(f'/api/orders/{self.order.id}/')
        self.assertEqual(len(detail.data.get('documents') or []), 4)

    def test_company_legal_profile_feeds_invoice(self):
        self.api.force_authenticate(user=self.client_user)
        patch = self.api.patch('/api/auth/company/', {
            'name': 'Logi Trade MCHJ',
            'address': 'Chilonzor 9',
            'director_name': 'Karimov A.',
            'bank_name': 'Kapitalbank',
            'bank_account': '20208000999999999999',
            'mfo': '01041',
            'oked': '49230',
        }, format='json')
        self.assertEqual(patch.status_code, 200)
        self.assertEqual(patch.data['company']['mfo'], '01041')

        docs = ensure_order_documents(self.order, force=True)
        invoice = next(doc for doc in docs if doc.doc_type == 'invoice')
        html = invoice.html_file.read().decode('utf-8')
        self.assertIn('Chilonzor 9', html)
        self.assertIn('Kapitalbank', html)
        self.assertIn('01041', html)

    def test_stranger_cannot_generate(self):
        self.api.force_authenticate(user=self.stranger)
        response = self.api.post(f'/api/orders/{self.order.id}/documents/generate/')
        self.assertEqual(response.status_code, 403)

    def test_driver_can_generate_and_download_act(self):
        self.api.force_authenticate(user=self.driver)
        response = self.api.post(f'/api/orders/{self.order.id}/documents/generate/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data['documents']), 4)
        act = self.api.get(f'/api/orders/{self.order.id}/documents/act/')
        self.assertEqual(act.status_code, 200)
        self.assertIn('dalolatnoma', act.content.decode('utf-8').lower())

    def test_unknown_doc_type_rejected(self):
        self.api.force_authenticate(user=self.client_user)
        response = self.api.get(f'/api/orders/{self.order.id}/documents/unknown/')
        self.assertEqual(response.status_code, 400)

    def test_public_pdf_and_company_get(self):
        self.api.force_authenticate(user=self.client_user)
        profile = self.api.get('/api/auth/company/')
        self.assertEqual(profile.status_code, 200)
        self.assertEqual(profile.data['company']['inn'], '123456789')
        self.assertEqual(profile.data['company']['name'], 'Logi Trade MCHJ')

        generated = self.api.post(f'/api/orders/{self.order.id}/documents/generate/')
        invoice = next(item for item in generated.data['documents'] if item['doc_type'] == 'invoice')
        self.api.force_authenticate(user=None)
        public_html = self.api.get(f'/api/orders/documents/public/{invoice["token"]}/')
        self.assertEqual(public_html.status_code, 200)
        if resolve_pdf_font():
            public_pdf = self.api.get(f'/api/orders/documents/public/{invoice["token"]}/?file=pdf')
            self.assertEqual(public_pdf.status_code, 200)
            body = b''.join(public_pdf.streaming_content)
            self.assertEqual(body[:4], b'%PDF')

        self.api.force_authenticate(user=self.driver)
        denied = self.api.patch('/api/auth/company/', {'name': 'Hack'}, format='json')
        self.assertEqual(denied.status_code, 403)
