import secrets

from django.core.cache import cache


WS_TICKET_TTL_SECONDS = 60
WS_TICKET_CACHE_PREFIX = "ws_auth_ticket"


def _cache_key(ticket: str) -> str:
    return f"{WS_TICKET_CACHE_PREFIX}:{ticket}"


def issue_ws_ticket(*, user_id: int) -> tuple[str, int]:
    ticket = secrets.token_urlsafe(32)
    cache.set(_cache_key(ticket), {"user_id": user_id}, WS_TICKET_TTL_SECONDS)
    return ticket, WS_TICKET_TTL_SECONDS


def consume_ws_ticket(ticket: str) -> int | None:
    cache_key = _cache_key(ticket)
    payload = cache.get(cache_key)
    if not payload:
        return None

    cache.delete(cache_key)
    user_id = payload.get("user_id")
    if not isinstance(user_id, int):
        return None
    return user_id
