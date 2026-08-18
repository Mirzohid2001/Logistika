from django.test import TestCase
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APIClient
from rest_framework import status
from apps.users.models import User
from apps.orders.models import Order, OrderStatus
from apps.advertisements.models import Advertisement
from apps.locations.models import Country, City
from .models import Chat, Message
from .ws_auth import consume_ws_ticket
import json


class ChatModelTest(TestCase):
    def setUp(self):
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
        )
        
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test Advertisement',
            title_en='Test Advertisement',
            title_uz='Test Advertisement',
            description_ru='Test Description',
            description_en='Test Description',
            description_uz='Test Description',
            weight=100,
            departure_address='Test Address',
            departure_city=self.city,
            destination_address='Test Destination',
            destination_city=self.city,
            proposed_cost=500000
        )
        
        order_status, _ = OrderStatus.objects.get_or_create(
            code='new',
            defaults={
                'name_ru': 'Новый',
                'name_en': 'New',
                'name_uz': 'Yangi',
            }
        )
        
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=order_status
        )

    def test_create_chat(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.assertIsNotNone(chat)
        self.assertEqual(chat.order, self.order)
        self.assertEqual(chat.client, self.client_user)
        self.assertEqual(chat.driver, self.driver_user)

    def test_create_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Test message'
        )
        self.assertIsNotNone(message)
        self.assertEqual(message.chat, chat)
        self.assertEqual(message.sender, self.client_user)
        self.assertEqual(message.text, 'Test message')
        self.assertFalse(message.is_read)
        self.assertEqual(message.message_type, Message.MESSAGE_TYPE_TEXT)
        self.assertFalse(message.is_edited)
        self.assertFalse(message.is_deleted)

    def test_create_message_with_reply(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        original_message = Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Original message'
        )
        reply_message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Reply message',
            reply_to=original_message
        )
        self.assertEqual(reply_message.reply_to, original_message)

    def test_message_reactions(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Test message',
            reactions={'1': '👍', '2': '❤️'}
        )
        self.assertIsNotNone(message.reactions)
        self.assertEqual(message.reactions['1'], '👍')
        self.assertEqual(message.reactions['2'], '❤️')

    def test_message_types(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        
        text_message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Text message',
            message_type=Message.MESSAGE_TYPE_TEXT
        )
        self.assertEqual(text_message.message_type, Message.MESSAGE_TYPE_TEXT)
        
        location_message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            message_type=Message.MESSAGE_TYPE_LOCATION,
            location_lat=41.3111,
            location_lng=69.2797,
            location_address='Tashkent'
        )
        self.assertEqual(location_message.message_type, Message.MESSAGE_TYPE_LOCATION)
        self.assertEqual(float(location_message.location_lat), 41.3111)
        
        contact_message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            message_type=Message.MESSAGE_TYPE_CONTACT,
            contact_name='John Doe',
            contact_phone='998901234567'
        )
        self.assertEqual(contact_message.message_type, Message.MESSAGE_TYPE_CONTACT)
        self.assertEqual(contact_message.contact_name, 'John Doe')

    def test_message_edit(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Original text'
        )
        message.text = 'Edited text'
        message.is_edited = True
        message.save()
        self.assertEqual(message.text, 'Edited text')
        self.assertTrue(message.is_edited)

    def test_message_delete(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Message to delete'
        )
        message.is_deleted = True
        message.text = ''
        message.save()
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.text, '')


class ChatAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.client_user = User.objects.create_user(
            phone='998901234567',
            password='testpass123',
            first_name='Client',
            last_name='User',
            is_driver=False
        )
        self.driver_user = User.objects.create_user(
            phone='998901234568',
            password='testpass123',
            first_name='Driver',
            last_name='User',
            is_driver=True
        )
        
        self.country = Country.objects.create(
            name_ru='Узбекистан',
            name_en='Uzbekistan',
            name_uz='O\'zbekiston',
            code='UZ'
        )
        self.city = City.objects.create(
            country=self.country,
            name_ru='Ташкент',
            name_en='Tashkent',
            name_uz='Toshkent'
        )
        
        self.advertisement = Advertisement.objects.create(
            client=self.client_user,
            title_ru='Test Advertisement',
            title_en='Test Advertisement',
            title_uz='Test Advertisement',
            description_ru='Test Description',
            description_en='Test Description',
            description_uz='Test Description',
            weight=100,
            departure_address='Test Address',
            departure_city=self.city,
            destination_address='Test Destination',
            destination_city=self.city,
            proposed_cost=500000
        )
        
        order_status, _ = OrderStatus.objects.get_or_create(
            code='new',
            defaults={
                'name_ru': 'Новый',
                'name_en': 'New',
                'name_uz': 'Yangi',
            }
        )
        
        self.order = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=order_status
        )

    def test_create_chat_api(self):
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post('/api/chats/create/', {'order_id': self.order.id})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', response.data)
        self.assertEqual(response.data['order']['id'], self.order.id)

    def test_get_chat_list(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get('/api/chats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 1)

    def test_get_chat_detail(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get(f'/api/chats/{chat.id}/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['id'], chat.id)
        self.assertIn('messages', response.data)

    def test_send_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/{chat.id}/messages/',
            {'text': 'Test message'}
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['text'], 'Test message')
        self.assertEqual(response.data['sender']['id'], self.client_user.id)

    def test_mark_messages_as_read(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Test message',
            is_read=False
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(f'/api/chats/{chat.id}/mark-read/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        message = Message.objects.get(chat=chat, sender=self.driver_user)
        self.assertTrue(message.is_read)

    def test_chat_permission_denied(self):
        other_user = User.objects.create_user(
            phone='998901234569',
            password='testpass123',
            first_name='Other',
            last_name='User'
        )
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=other_user)
        response = self.client.get(f'/api/chats/{chat.id}/')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_send_message_with_reply(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        original_message = Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Original message'
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/{chat.id}/messages/',
            {
                'text': 'Reply message',
                'reply_to': original_message.id
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['text'], 'Reply message')
        self.assertIsNotNone(response.data['reply_to'])
        self.assertEqual(response.data['reply_to']['id'], original_message.id)

    def test_send_location_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/{chat.id}/messages/',
            {
                'message_type': Message.MESSAGE_TYPE_LOCATION,
                'location_lat': '41.3111',
                'location_lng': '69.2797',
                'location_address': 'Tashkent, Uzbekistan'
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message_type'], Message.MESSAGE_TYPE_LOCATION)
        self.assertIsNotNone(response.data['location_lat'])

    def test_send_contact_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/{chat.id}/messages/',
            {
                'message_type': Message.MESSAGE_TYPE_CONTACT,
                'contact_name': 'John Doe',
                'contact_phone': '998901234567'
            }
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message_type'], Message.MESSAGE_TYPE_CONTACT)
        self.assertEqual(response.data['contact_name'], 'John Doe')
        self.assertEqual(response.data['contact_phone'], '998901234567')

    def test_update_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Original text'
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.patch(
            f'/api/chats/messages/{message.id}/',
            {'text': 'Updated text'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['text'], 'Updated text')
        self.assertTrue(response.data['is_edited'])

    def test_update_message_permission_denied(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Original text'
        )
        self.client.force_authenticate(user=self.driver_user)
        response = self.client.patch(
            f'/api/chats/messages/{message.id}/',
            {'text': 'Updated text'}
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_delete_message(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Message to delete'
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.delete(f'/api/chats/messages/{message.id}/delete/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        
        message.refresh_from_db()
        self.assertTrue(message.is_deleted)
        self.assertEqual(message.text, '')

    def test_add_reaction(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Test message'
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/messages/{message.id}/reaction/',
            {'reaction': '👍'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(response.data['reactions'])
        self.assertIn(str(self.client_user.id), response.data['reactions'])
        self.assertEqual(response.data['reactions'][str(self.client_user.id)], '👍')

    def test_remove_reaction(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Test message',
            reactions={str(self.client_user.id): '👍'}
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.post(
            f'/api/chats/messages/{message.id}/reaction/',
            {'reaction': '👍'}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn(str(self.client_user.id), response.data['reactions'])

    def test_reaction_permission_denied_for_outsider(self):
        outsider = User.objects.create_user(
            phone='998901234570',
            password='testpass123',
            first_name='Out',
            last_name='Sider',
        )
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        message = Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Test message'
        )
        self.client.force_authenticate(user=outsider)
        response = self.client.post(
            f'/api/chats/messages/{message.id}/reaction/',
            {'reaction': '👍'}
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_search_messages(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Hello world'
        )
        Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Test message'
        )
        Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='Hello again',
            is_deleted=True
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get(f'/api/chats/{chat.id}/search/?q=Hello')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['text'], 'Hello world')

    def test_upload_image(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        image = SimpleUploadedFile(
            "test_image.jpg",
            b"file_content",
            content_type="image/jpeg"
        )
        response = self.client.post(
            '/api/chats/messages/upload-image/',
            {
                'chat_id': chat.id,
                'image': image
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message_type'], Message.MESSAGE_TYPE_IMAGE)
        self.assertIsNotNone(response.data['image'])

    def test_upload_file(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        file = SimpleUploadedFile(
            "test_file.pdf",
            b"file_content",
            content_type="application/pdf"
        )
        response = self.client.post(
            '/api/chats/messages/upload-file/',
            {
                'chat_id': chat.id,
                'file': file
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message_type'], Message.MESSAGE_TYPE_FILE)
        self.assertIsNotNone(response.data['file'])
        self.assertIsNotNone(response.data['file_name'])

    def test_upload_voice(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        self.client.force_authenticate(user=self.client_user)
        voice = SimpleUploadedFile(
            "test_voice.m4a",
            b"voice_content",
            content_type="audio/m4a"
        )
        response = self.client.post(
            '/api/chats/messages/upload-voice/',
            {
                'chat_id': chat.id,
                'voice': voice
            },
            format='multipart'
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['message_type'], Message.MESSAGE_TYPE_VOICE)
        self.assertIsNotNone(response.data['voice'])

    def test_chat_list_ordering(self):
        chat1 = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        Message.objects.create(
            chat=chat1,
            sender=self.client_user,
            text='First message'
        )
        
        order2 = Order.objects.create(
            advertisement=self.advertisement,
            driver=self.driver_user,
            client=self.client_user,
            status=OrderStatus.objects.get(code='new')
        )
        chat2 = Chat.objects.create(
            order=order2,
            client=self.client_user,
            driver=self.driver_user
        )
        Message.objects.create(
            chat=chat2,
            sender=self.client_user,
            text='Second message'
        )
        
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get('/api/chats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertGreaterEqual(len(response.data['results']), 2)
        self.assertEqual(response.data['results'][0]['id'], chat2.id)

    def test_unread_count(self):
        chat = Chat.objects.create(
            order=self.order,
            client=self.client_user,
            driver=self.driver_user
        )
        Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Unread message 1',
            is_read=False
        )
        Message.objects.create(
            chat=chat,
            sender=self.driver_user,
            text='Unread message 2',
            is_read=False
        )
        Message.objects.create(
            chat=chat,
            sender=self.client_user,
            text='My message',
            is_read=False
        )
        self.client.force_authenticate(user=self.client_user)
        response = self.client.get('/api/chats/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        chat_data = next((c for c in response.data['results'] if c['id'] == chat.id), None)
        self.assertIsNotNone(chat_data)
        self.assertEqual(chat_data['unread_count'], 2)


class WebSocketTicketAPITest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            phone='998901111111',
            password='testpass123',
            first_name='Socket',
            last_name='User',
        )

    def test_issue_ws_ticket_requires_authentication(self):
        response = self.client.post('/api/chats/ws-ticket/', {})
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_issue_ws_ticket_returns_one_time_ticket(self):
        self.client.force_authenticate(user=self.user)

        response = self.client.post('/api/chats/ws-ticket/', {})

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('ticket', response.data)
        self.assertEqual(response.data['expires_in'], 60)

        ticket = response.data['ticket']
        self.assertEqual(consume_ws_ticket(ticket), self.user.id)
        self.assertIsNone(consume_ws_ticket(ticket))
