import json
from hashlib import md5
from typing import Any, Dict

from django.core.cache import cache


def _version_storage_key(scope: str, entity_id: Any) -> str:
    return f"cache_version:{scope}:{entity_id}"


def get_cache_version(scope: str, entity_id: Any) -> int:
    key = _version_storage_key(scope, entity_id)
    version = cache.get(key)
    if version is None:
        version = 1
        cache.set(key, version, timeout=None)
    return int(version)


def bump_cache_version(scope: str, entity_id: Any) -> int:
    key = _version_storage_key(scope, entity_id)
    current = cache.get(key, 1)
    next_version = int(current) + 1
    cache.set(key, next_version, timeout=None)
    return next_version


def build_user_cache_key(scope: str, user_id: Any, params: Dict[str, Any]) -> str:
    version = get_cache_version(scope, user_id)
    payload = json.dumps(params, sort_keys=True, default=str)
    params_hash = md5(payload.encode("utf-8")).hexdigest()
    return f"{scope}:v{version}:user:{user_id}:{params_hash}"
