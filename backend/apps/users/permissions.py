from rest_framework import permissions

from .roles import is_marketplace_client, is_marketplace_driver, is_staff_account


def _is_authenticated(user):
    return bool(user and user.is_authenticated)


def _has_admin_like_role(user):
    return bool(
        getattr(user, 'is_dispatcher', False)
        or getattr(user, 'is_updater', False)
        or getattr(user, 'is_operator', False)
        or getattr(user, 'is_admin', False)
        or getattr(user, 'is_staff', False)
        or getattr(user, 'is_superuser', False)
    )


def can_access_order(user, order) -> bool:
    if not _is_authenticated(user):
        return False
    if _has_admin_like_role(user):
        return True
    return order.client_id == user.id or order.driver_id == user.id


def can_access_chat(user, chat) -> bool:
    if not _is_authenticated(user):
        return False
    if getattr(user, 'is_dispatcher', False) or getattr(user, 'is_updater', False):
        return True
    return chat.client_id == user.id or chat.driver_id == user.id


def can_access_payment(user, payment) -> bool:
    if not _is_authenticated(user):
        return False
    if getattr(user, 'is_dispatcher', False) or getattr(user, 'is_updater', False):
        return True
    if payment.user_id == user.id:
        return True
    if payment.order_id:
        return can_access_order(user, payment.order)
    return False


def can_access_bid(user, bid) -> bool:
    if not _is_authenticated(user):
        return False
    if getattr(user, 'is_dispatcher', False) or getattr(user, 'is_updater', False):
        return True
    return bid.client_id == user.id or bid.driver_id == user.id


class IsClient(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return _is_authenticated(user) and is_marketplace_client(user)


class IsDriver(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return _is_authenticated(user) and is_marketplace_driver(user)


class IsOperator(permissions.BasePermission):
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and request.user.is_operator


class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and request.user.is_admin


class IsClientOrDriver(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return IsClient().has_permission(request, view) or IsDriver().has_permission(request, view)


class IsVerified(permissions.BasePermission):
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and request.user.is_verified


class IsDispatcher(permissions.BasePermission):
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and request.user.is_dispatcher


class IsUpdater(permissions.BasePermission):
    def has_permission(self, request, view):
        return _is_authenticated(request.user) and request.user.is_updater


class IsDispatcherOrUpdater(permissions.BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return _is_authenticated(user) and (user.is_dispatcher or user.is_updater)


class IsStaffModerator(permissions.BasePermission):
    """Admin, dispatcher, updater, operator, or Django staff."""

    def has_permission(self, request, view):
        return _is_authenticated(request.user) and _has_admin_like_role(request.user)

