from __future__ import annotations

from .models import NotificationPreference, UserNotificationSettings


def get_or_create_user_settings(user):
    settings, _ = UserNotificationSettings.objects.get_or_create(user=user)
    return settings


def user_allows_channel(user, notification_type: str, channel: str = 'push') -> bool:
    settings = get_or_create_user_settings(user)
    if channel == 'push' and not settings.push_enabled:
        return False
    if channel == 'in_app' and not settings.in_app_enabled:
        return False

    pref = NotificationPreference.objects.filter(
        user=user,
        notification_type=notification_type,
    ).first()
    if not pref:
        return True
    if channel == 'push':
        return pref.push_enabled
    return pref.in_app_enabled


def get_user_preferences(user) -> dict:
    settings = get_or_create_user_settings(user)
    per_type = {
        pref.notification_type: {
            'push_enabled': pref.push_enabled,
            'in_app_enabled': pref.in_app_enabled,
        }
        for pref in NotificationPreference.objects.filter(user=user)
    }
    return {
        'push_enabled': settings.push_enabled,
        'in_app_enabled': settings.in_app_enabled,
        'types': per_type,
    }


def update_user_preferences(user, payload: dict) -> dict:
    settings = get_or_create_user_settings(user)
    if 'push_enabled' in payload:
        settings.push_enabled = bool(payload['push_enabled'])
    if 'in_app_enabled' in payload:
        settings.in_app_enabled = bool(payload['in_app_enabled'])
    settings.save()

    type_updates = payload.get('types') or {}
    for notification_type, values in type_updates.items():
        pref, _ = NotificationPreference.objects.get_or_create(
            user=user,
            notification_type=notification_type,
        )
        if 'push_enabled' in values:
            pref.push_enabled = bool(values['push_enabled'])
        if 'in_app_enabled' in values:
            pref.in_app_enabled = bool(values['in_app_enabled'])
        pref.save()

    return get_user_preferences(user)
