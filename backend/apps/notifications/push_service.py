import os
from pyfcm import FCMNotification
from django.conf import settings
from apps.users.models import User


class PushNotificationService:
    def __init__(self):
        # FCM server key ni environment variable dan olamiz
        self.fcm_api_key = os.getenv('FCM_SERVER_KEY', '')
        if self.fcm_api_key:
            self.push_service = FCMNotification(api_key=self.fcm_api_key)
        else:
            self.push_service = None

    def send_notification(
        self,
        user: User,
        title: str,
        body: str,
        data: dict = None,
        sound: str = 'default'
    ) -> bool:
        """
        Push notification yuborish
        """
        if not self.push_service or not user.fcm_token:
            return False

        try:
            registration_id = user.fcm_token
            message_title = title
            message_body = body
            result = self.push_service.notify_single_device(
                registration_id=registration_id,
                message_title=message_title,
                message_body=message_body,
                data_message=data or {},
                sound=sound,
                badge=1,
            )
            return result.get('success', 0) == 1
        except Exception as e:
            print(f"Push notification error: {e}")
            return False

    def send_notification_to_multiple(
        self,
        users: list,
        title: str,
        body: str,
        data: dict = None,
        sound: str = 'default'
    ) -> dict:
        """
        Bir nechta foydalanuvchilarga push notification yuborish
        """
        if not self.push_service:
            return {'success': 0, 'failure': len(users)}

        registration_ids = [user.fcm_token for user in users if user.fcm_token]
        
        if not registration_ids:
            return {'success': 0, 'failure': len(users)}

        try:
            result = self.push_service.notify_multiple_devices(
                registration_ids=registration_ids,
                message_title=title,
                message_body=body,
                data_message=data or {},
                sound=sound,
                badge=1,
            )
            return result
        except Exception as e:
            print(f"Push notification error: {e}")
            return {'success': 0, 'failure': len(registration_ids)}


push_service = PushNotificationService()
