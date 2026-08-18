from apps.advertisements.driver_matching import get_driver_matches


def get_backhaul_matches(driver, limit: int = 8) -> dict:
    payload = get_driver_matches(driver, limit=limit, backhaul_only=True)
    payload['match_reason'] = 'return_load'
    return payload
