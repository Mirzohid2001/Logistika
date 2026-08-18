from django.utils import timezone


def user_is_marketplace_banned(user) -> bool:
    if not user or not getattr(user, 'is_active', True):
        return True
    if getattr(user, 'is_blocked', False):
        return True
    suspended_until = getattr(user, 'suspended_until', None)
    if suspended_until and suspended_until > timezone.now():
        return True
    return False


def marketplace_ban_reason(user) -> str | None:
    if not user:
        return 'Foydalanuvchi topilmadi'
    if getattr(user, 'is_blocked', False):
        return 'Hisob bloklangan'
    suspended_until = getattr(user, 'suspended_until', None)
    if suspended_until and suspended_until > timezone.now():
        return f'Hisob vaqtincha to\'xtatilgan ({suspended_until.strftime("%d.%m.%Y %H:%M")} gacha)'
    return None
