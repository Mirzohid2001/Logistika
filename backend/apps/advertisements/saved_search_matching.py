from django.db.models import Q

from apps.advertisements.models import Advertisement, SavedSearch


def _filters_dict(saved_search: SavedSearch) -> dict:
    raw = saved_search.filters
    return raw if isinstance(raw, dict) else {}


def advertisement_matches_saved_search_filters(advertisement: Advertisement, saved_search: SavedSearch) -> bool:
    filters = _filters_dict(saved_search)
    cargo_category = filters.get('cargo_category')
    if cargo_category and advertisement.cargo_category != cargo_category:
        return False
    route_preference = filters.get('route_preference')
    if route_preference and advertisement.route_preference != route_preference:
        return False
    if filters.get('is_fragile') is True and advertisement.cargo_category != 'fragile':
        return False
    return True


def apply_saved_search_to_queryset(queryset, saved_search: SavedSearch):
    if saved_search.departure_city_id:
        queryset = queryset.filter(departure_city_id=saved_search.departure_city_id)
    if saved_search.destination_city_id:
        queryset = queryset.filter(destination_city_id=saved_search.destination_city_id)
    if saved_search.min_weight is not None:
        queryset = queryset.filter(weight__gte=saved_search.min_weight)
    if saved_search.max_weight is not None:
        queryset = queryset.filter(weight__lte=saved_search.max_weight)
    if saved_search.min_cost is not None:
        queryset = queryset.filter(proposed_cost__gte=saved_search.min_cost)
    if saved_search.max_cost is not None:
        queryset = queryset.filter(proposed_cost__lte=saved_search.max_cost)

    filters = _filters_dict(saved_search)
    cargo_category = filters.get('cargo_category')
    if cargo_category:
        queryset = queryset.filter(cargo_category=cargo_category)
    route_preference = filters.get('route_preference')
    if route_preference:
        queryset = queryset.filter(route_preference=route_preference)
    if filters.get('is_fragile') is True:
        queryset = queryset.filter(cargo_category='fragile')

    query = (saved_search.query or '').strip()
    if query:
        queryset = queryset.filter(
            Q(title_ru__icontains=query)
            | Q(title_en__icontains=query)
            | Q(title_uz__icontains=query)
            | Q(description_ru__icontains=query)
            | Q(description_en__icontains=query)
            | Q(description_uz__icontains=query)
        )
    return queryset


def advertisement_matches_saved_search(advertisement: Advertisement, saved_search: SavedSearch) -> bool:
    if advertisement.is_closed:
        return False
    if saved_search.departure_city_id and advertisement.departure_city_id != saved_search.departure_city_id:
        return False
    if saved_search.destination_city_id and advertisement.destination_city_id != saved_search.destination_city_id:
        return False
    if saved_search.min_weight is not None and advertisement.weight < saved_search.min_weight:
        return False
    if saved_search.max_weight is not None and advertisement.weight > saved_search.max_weight:
        return False
    if saved_search.min_cost is not None and (
        advertisement.proposed_cost is None or advertisement.proposed_cost < saved_search.min_cost
    ):
        return False
    if saved_search.max_cost is not None and (
        advertisement.proposed_cost is None or advertisement.proposed_cost > saved_search.max_cost
    ):
        return False
    if not advertisement_matches_saved_search_filters(advertisement, saved_search):
        return False
    query = (saved_search.query or '').strip()
    if query:
        text_match = (
            Q(title_ru__icontains=query)
            | Q(title_en__icontains=query)
            | Q(title_uz__icontains=query)
            | Q(description_ru__icontains=query)
            | Q(description_en__icontains=query)
            | Q(description_uz__icontains=query)
        )
        if not Advertisement.objects.filter(pk=advertisement.pk).filter(text_match).exists():
            return False
    return True
