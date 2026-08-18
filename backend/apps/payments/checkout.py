"""Extract checkout / redirect URLs from heterogeneous gateway payloads."""

from __future__ import annotations

from typing import Any

_URL_KEYS = (
    'checkout_url',
    'payment_url',
    'redirect_url',
    'pay_url',
    'url',
    'link',
)


def extract_checkout_url(gateway_response: Any) -> str | None:
    if not isinstance(gateway_response, dict):
        return None

    for key in _URL_KEYS:
        value = gateway_response.get(key)
        if isinstance(value, str) and value.startswith(('http://', 'https://')):
            return value

    for nested_key in ('result', 'data', 'payment', 'checkout'):
        nested = gateway_response.get(nested_key)
        if isinstance(nested, dict):
            found = extract_checkout_url(nested)
            if found:
                return found

    return None
