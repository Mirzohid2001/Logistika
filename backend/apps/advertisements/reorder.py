from apps.advertisements.models import Advertisement
from apps.orders.models import Order


def duplicate_advertisement_from_order(order: Order) -> Advertisement:
    source = order.advertisement
    suffix = ' (qayta)'

    def append_suffix(value: str) -> str:
        base = (value or source.title_uz).strip()
        if base.endswith(suffix.strip()):
            return base
        return f'{base}{suffix}'

    return Advertisement.objects.create(
        client=order.client,
        title_ru=append_suffix(source.title_ru),
        title_en=append_suffix(source.title_en),
        title_uz=append_suffix(source.title_uz),
        description_ru=source.description_ru,
        description_en=source.description_en,
        description_uz=source.description_uz,
        weight=source.weight,
        departure_city=source.departure_city,
        departure_address=source.departure_address,
        destination_city=source.destination_city,
        destination_address=source.destination_address,
        cargo_category=source.cargo_category,
        volume_m3=source.volume_m3,
        units_count=source.units_count,
        pickup_window_start=None,
        pickup_window_end=None,
        delivery_deadline=None,
        contact_name=source.contact_name,
        contact_phone=source.contact_phone,
        receiver_name=source.receiver_name,
        receiver_phone=source.receiver_phone,
        special_requirements=source.special_requirements,
        required_body_type=getattr(source, 'required_body_type', '') or '',
        requires_adr=bool(getattr(source, 'requires_adr', False)),
        requires_reefer=bool(getattr(source, 'requires_reefer', False)),
        is_heavy=bool(getattr(source, 'is_heavy', False)),
        route_preference=source.route_preference,
        route_stops=list(source.route_stops) if isinstance(source.route_stops, list) else [],
        proposed_cost=source.proposed_cost,
        currency=source.currency,
        is_closed=False,
    )
