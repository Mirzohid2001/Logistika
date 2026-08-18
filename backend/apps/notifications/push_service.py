import logging
import os

from django.conf import settings
from pyfcm import FCMNotification

from apps.users.device_tokens import INVALID_FCM_ERRORS, active_tokens_for_user, deactivate_tokens
from apps.users.models import User

logger = logging.getLogger(__name__)


class PushNotificationService:
    def __init__(self):
        self.fcm_api_key = os.getenv('FCM_SERVER_KEY', '') or getattr(settings, 'FCM_SERVER_KEY', '')
        if self.fcm_api_key:
            self.push_service = FCMNotification(api_key=self.fcm_api_key)
        else:
            self.push_service = None

    def send_notification_detailed(
        self,
        user: User,
        title: str,
        body: str,
        data: dict = None,
        sound: str = 'default',
    ) -> tuple[bool, str]:
        if not self.push_service:
            return False, 'fcm_not_configured'

        tokens = active_tokens_for_user(user)
        if not tokens:
            return False, 'missing_fcm_token'

        success_count = 0
        last_error = ''
        invalid_tokens: list[str] = []

        for token in tokens:
            try:
                result = self.push_service.notify_single_device(
                    registration_id=token,
                    message_title=title,
                    message_body=body,
                    data_message=data or {},
                    sound=sound,
                    badge=1,
                )
                if result.get('success', 0) == 1:
                    success_count += 1
                    continue
                error = self._extract_error(result)
                last_error = error or str(result.get('failure', 'push_failed'))
                if self._is_invalid_token_error(error):
                    invalid_tokens.append(token)
            except Exception as exc:
                logger.exception('Push notification error for user %s', user.id)
                last_error = str(exc)

        if invalid_tokens:
            deactivate_tokens(invalid_tokens, reason=last_error)

        if success_count:
            return True, ''
        return False, last_error or 'push_failed'

    def send_notification(
        self,
        user: User,
        title: str,
        body: str,
        data: dict = None,
        sound: str = 'default',
    ) -> bool:
        success, _ = self.send_notification_detailed(user, title, body, data=data, sound=sound)
        return success

    def send_notification_to_multiple(
        self,
        users: list,
        title: str,
        body: str,
        data: dict = None,
        sound: str = 'default',
    ) -> dict:
        if not self.push_service:
            return {'success': 0, 'failure': len(users)}

        success = 0
        failure = 0
        for user in users:
            ok, _error = self.send_notification_detailed(
                user, title, body, data=data, sound=sound,
            )
            if ok:
                success += 1
            else:
                failure += 1
        return {'success': success, 'failure': failure}

    def _extract_error(self, result: dict) -> str:
        results = result.get('results') or []
        if results and isinstance(results[0], dict):
            return str(results[0].get('error') or '')
        return str(result.get('error') or '')

    def _is_invalid_token_error(self, error: str) -> bool:
        return bool(error) and error in INVALID_FCM_ERRORS


push_service = PushNotificationService()
