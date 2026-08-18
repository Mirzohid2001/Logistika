from rest_framework import permissions

from .services import subscriptions_enforced, user_has_marketplace_access, user_requires_subscription


class HasActiveSubscription(permissions.BasePermission):
    message = 'Faol obuna talab qilinadi. Davom etish uchun obuna sotib oling.'
    code = 'subscription_required'

    def has_permission(self, request, view):
        if not subscriptions_enforced():
            return True
        user = request.user
        if not user or not user.is_authenticated:
            return True
        if not user_requires_subscription(user):
            return True
        return user_has_marketplace_access(user)
