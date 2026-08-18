from decimal import Decimal

from apps.vehicles.models import Vehicle


def vehicle_is_reefer(vehicle: Vehicle) -> bool:
    return bool(getattr(vehicle, 'is_reefer', False) or getattr(vehicle, 'body_type', '') == 'reefer')


def vehicle_meets_requirements(vehicle: Vehicle, requirements: dict) -> tuple[bool, str]:
    body = (requirements.get('body') or '').strip()
    if body and getattr(vehicle, 'body_type', 'other') != body:
        return False, 'body_mismatch'
    if requirements.get('adr') and not getattr(vehicle, 'has_adr', False):
        return False, 'adr_required'
    if requirements.get('reefer') and not vehicle_is_reefer(vehicle):
        return False, 'reefer_required'
    if requirements.get('heavy') and not getattr(vehicle, 'is_heavy_haul', False):
        return False, 'heavy_required'
    return True, 'ok'


def _ad_requirements(advertisement) -> dict:
    if advertisement is None:
        return {'body': '', 'adr': False, 'reefer': False, 'heavy': False}
    reqs = list(getattr(advertisement, 'special_requirements', None) or [])
    return {
        'body': (getattr(advertisement, 'required_body_type', '') or '').strip(),
        'adr': bool(getattr(advertisement, 'requires_adr', False) or 'dangerous' in reqs),
        'reefer': bool(getattr(advertisement, 'requires_reefer', False) or 'refrigerated' in reqs),
        'heavy': bool(getattr(advertisement, 'is_heavy', False)),
    }


def _vehicle_payload(vehicle: Vehicle) -> dict:
    return {
        'id': vehicle.id,
        'make': vehicle.make,
        'model': vehicle.model,
        'number': vehicle.number,
        'load_capacity': float(vehicle.load_capacity),
        'body_type': getattr(vehicle, 'body_type', 'other'),
        'has_adr': bool(getattr(vehicle, 'has_adr', False)),
        'is_reefer': vehicle_is_reefer(vehicle),
        'is_heavy_haul': bool(getattr(vehicle, 'is_heavy_haul', False)),
    }


def check_driver_load_fit(
    driver,
    weight_kg: Decimal,
    volume_m3: Decimal | None = None,
    advertisement=None,
    vehicle: Vehicle | None = None,
) -> dict:
    vehicles = []
    if vehicle is not None:
        vehicles = [vehicle]
    else:
        approved = list(Vehicle.objects.filter(user=driver, verification_status='approved'))
        vehicles = approved or list(Vehicle.objects.filter(user=driver))

    if not vehicles:
        return {
            'fits': False,
            'reason': 'no_vehicle',
            'best_vehicle': None,
            'margin_kg': None,
        }

    weight = Decimal(str(weight_kg))
    volume = Decimal(str(volume_m3)) if volume_m3 is not None else None
    requirements = _ad_requirements(advertisement)
    best = None
    best_margin = None
    last_capability_reason = 'ok'

    for item in vehicles:
        capable, capability_reason = vehicle_meets_requirements(item, requirements)
        if not capable:
            last_capability_reason = capability_reason
            continue
        capacity = Decimal(str(item.load_capacity))
        if capacity < weight:
            continue
        if volume is not None and Decimal(str(item.cargo_volume)) < volume:
            continue
        margin = capacity - weight
        if volume is not None:
            margin = min(margin, Decimal(str(item.cargo_volume)) - volume)
        if best is None or margin < best_margin:
            best = item
            best_margin = margin

    if best is None:
        largest = max(vehicles, key=lambda item: float(item.load_capacity))
        reason = last_capability_reason if last_capability_reason != 'ok' else 'overweight'
        if reason == 'overweight' and volume is not None:
            fitting_weight = [item for item in vehicles if Decimal(str(item.load_capacity)) >= weight]
            if fitting_weight and not any(Decimal(str(item.cargo_volume)) >= volume for item in fitting_weight):
                reason = 'overvolume'
        return {
            'fits': False,
            'reason': reason,
            'best_vehicle': _vehicle_payload(largest),
            'margin_kg': float(Decimal(str(largest.load_capacity)) - weight),
        }

    return {
        'fits': True,
        'reason': 'ok',
        'best_vehicle': _vehicle_payload(best),
        'margin_kg': float(best_margin) if best_margin is not None else None,
    }
