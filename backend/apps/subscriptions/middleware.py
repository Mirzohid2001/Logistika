from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

from .services import subscriptions_enforced, user_has_marketplace_access, user_requires_subscription

API_PREFIX = '/api/'

EXEMPT_PREFIXES = (
    '/api/auth/',
    '/api/subscriptions/',
    '/api/content/',
    '/api/news/',
    '/api/locations/',
    '/api/schema/',
    '/api/docs/',
    '/api/redoc/',
    '/admin/',
)


def is_subscription_exempt_path(path: str) -> bool:
    if any(path.startswith(prefix) for prefix in EXEMPT_PREFIXES):
        return True
    # Public order tracking share links must stay accessible with JWT present.
    if path.startswith('/api/orders/share/'):
        return True
    if path.startswith('/api/orders/documents/public/'):
        return True
    return False


class SubscriptionEnforcementMiddleware(MiddlewareMixin):
    """
    Block API access for drivers/clients without an active subscription.
    Staff roles and auth/subscription endpoints are exempt.
    """

    def process_request(self, request):
        if not subscriptions_enforced():
            return None

        path = request.path
        if not path.startswith(API_PREFIX):
            return None

        if is_subscription_exempt_path(path):
            return None

        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            jwt_auth = JWTAuthentication()
            header = jwt_auth.get_header(request)
            if header is None:
                return None
            raw_token = jwt_auth.get_raw_token(header)
            if raw_token is None:
                return None
            try:
                validated = jwt_auth.get_validated_token(raw_token)
                user = jwt_auth.get_user(validated)
                request.user = user
            except (InvalidToken, TokenError):
                return None

        if not user_requires_subscription(user):
            return None

        if user_has_marketplace_access(user):
            return None

        return JsonResponse(
            {
                'error': 'Bepul sinov tugadi. Davom etish uchun obuna sotib oling.',
                'code': 'subscription_required',
            },
            status=403,
        )
