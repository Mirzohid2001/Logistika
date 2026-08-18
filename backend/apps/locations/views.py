from django.db.models import Q
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from apps.common.services import get_language_from_request
from .geo import DEFAULT_MAX_DISTANCE_KM, find_nearest_city, serialize_nearest_city
from .models import Country, City
from .serializers import CountrySerializer, CitySerializer


def _localized_name_field(request) -> str:
    lang = get_language_from_request(request)
    if lang in ('ru', 'en', 'uz'):
        return f'name_{lang}'
    return 'name_ru'


class CountryListView(APIView):
    permission_classes = [AllowAny]
    pagination_class = None

    @extend_schema(responses={200: CountrySerializer(many=True)})
    def get(self, request):
        query = (request.query_params.get('q') or '').strip()
        countries = Country.objects.all()
        if query:
            countries = countries.filter(
                Q(name_ru__icontains=query)
                | Q(name_en__icontains=query)
                | Q(name_uz__icontains=query)
                | Q(code__icontains=query)
            )
        order_field = _localized_name_field(request)
        countries = countries.order_by(order_field, 'code')
        serializer = CountrySerializer(countries, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class CityListView(APIView):
    permission_classes = [AllowAny]
    pagination_class = None

    @extend_schema(responses={200: CitySerializer(many=True)})
    def get(self, request):
        country_id = request.query_params.get('country_id')
        query = (request.query_params.get('q') or '').strip()

        cities = City.objects.select_related('country')
        if country_id:
            cities = cities.filter(country_id=country_id)
        if query:
            cities = cities.filter(
                Q(name_ru__icontains=query)
                | Q(name_en__icontains=query)
                | Q(name_uz__icontains=query)
            )

        order_field = _localized_name_field(request)
        cities = cities.order_by(order_field, 'name_ru')
        serializer = CitySerializer(cities, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class NearestCityView(APIView):
    """Phone GPS → nearest catalog city (same UX idea as ride-hailing city snap)."""

    permission_classes = [AllowAny]
    pagination_class = None

    def get(self, request):
        try:
            lat = float(request.query_params.get('lat'))
            lng = float(request.query_params.get('lng'))
        except (TypeError, ValueError):
            return Response(
                {'error': 'lat va lng kerak (masalan ?lat=41.3&lng=69.2)'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not (-90 <= lat <= 90 and -180 <= lng <= 180):
            return Response({'error': 'lat/lng oralig\'i noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            max_km = float(request.query_params.get('max_km') or DEFAULT_MAX_DISTANCE_KM)
        except (TypeError, ValueError):
            max_km = DEFAULT_MAX_DISTANCE_KM
        max_km = max(5.0, min(max_km, 500.0))

        country_id = request.query_params.get('country_id')
        qs = City.objects.select_related('country')
        if country_id:
            qs = qs.filter(country_id=country_id)

        city, distance_km = find_nearest_city(lat, lng, max_distance_km=max_km, queryset=qs)
        if not city or distance_km is None:
            return Response(
                {'error': 'Yaqin shahar topilmadi', 'distance_km': distance_km},
                status=status.HTTP_404_NOT_FOUND,
            )

        lang = get_language_from_request(request)
        return Response(serialize_nearest_city(city, distance_km, lang=lang), status=status.HTTP_200_OK)
