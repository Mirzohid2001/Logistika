from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from .models import Country, City
from .serializers import CountrySerializer, CitySerializer


class CountryListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: CountrySerializer(many=True)})
    def get(self, request):
        countries = Country.objects.all()
        serializer = CountrySerializer(countries, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class CityListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: CitySerializer(many=True)})
    def get(self, request):
        country_id = request.query_params.get('country_id')
        if country_id:
            cities = City.objects.filter(country_id=country_id)
        else:
            cities = City.objects.all()
        serializer = CitySerializer(cities, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
