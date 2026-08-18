"""
Marketplace account roles — single source of truth.

Account types:
  - client  — posts loads, pays for orders
  - driver  — bids, accepts loads, delivers
  - staff   — dispatcher / updater / operator / admin (no subscription)

A phone number = one marketplace role (client XOR driver at registration).
"""

from __future__ import annotations

from typing import Literal, Optional

MarketplaceRole = Literal['client', 'driver']


def is_staff_account(user) -> bool:
    if not user or not getattr(user, 'is_authenticated', False):
        return False
    return bool(
        getattr(user, 'is_dispatcher', False)
        or getattr(user, 'is_updater', False)
        or getattr(user, 'is_operator', False)
        or getattr(user, 'is_admin', False)
        or getattr(user, 'is_staff', False)
        or getattr(user, 'is_superuser', False)
    )


def get_marketplace_role(user) -> Optional[MarketplaceRole]:
    """Return client | driver for marketplace users, None for staff."""
    if not user or not getattr(user, 'is_authenticated', False):
        return None
    if is_staff_account(user):
        return None
    if getattr(user, 'is_driver', False):
        return 'driver'
    if getattr(user, 'is_client', False):
        return 'client'
    return None


def is_marketplace_client(user) -> bool:
    return get_marketplace_role(user) == 'client'


def is_marketplace_driver(user) -> bool:
    return get_marketplace_role(user) == 'driver'


def requires_subscription(user) -> bool:
    return get_marketplace_role(user) is not None


def subscription_audience(user) -> Optional[MarketplaceRole]:
    """Plan audience key — same as marketplace role."""
    return get_marketplace_role(user)


def normalize_registration_roles(*, is_driver: bool) -> dict:
    """Enforce client XOR driver at signup."""
    return {
        'is_driver': bool(is_driver),
        'is_client': not bool(is_driver),
    }
