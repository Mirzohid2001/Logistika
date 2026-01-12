from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsClient, IsDriver
from django.db.models import Q
from .models import Advertisement
from .serializers import AdvertisementListSerializer, AdvertisementDetailSerializer, AdvertisementCreateSerializer


class AdvertisementListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: AdvertisementListSerializer(many=True)})
    def get(self, request):
        queryset = Advertisement.objects.filter(is_closed=False)
        
        country_from = request.query_params.get('country_from')
        country_to = request.query_params.get('country_to')
        city_from = request.query_params.get('city_from')
        city_to = request.query_params.get('city_to')
        volume_min = request.query_params.get('volume_min')
        volume_max = request.query_params.get('volume_max')
        weight_min = request.query_params.get('weight_min')
        weight_max = request.query_params.get('weight_max')
        date_order = request.query_params.get('date', 'new')
        price_order = request.query_params.get('price', None)
        
        if country_from:
            queryset = queryset.filter(departure_country_id=country_from)
        if country_to:
            queryset = queryset.filter(destination_country_id=country_to)
        if city_from:
            queryset = queryset.filter(departure_city_id=city_from)
        if city_to:
            queryset = queryset.filter(destination_city_id=city_to)
        if weight_min:
            queryset = queryset.filter(weight__gte=weight_min)
        if weight_max:
            queryset = queryset.filter(weight__lte=weight_max)
        if volume_min:
            queryset = queryset.filter(height__gte=volume_min, width__gte=volume_min, length__gte=volume_min)
        if volume_max:
            queryset = queryset.filter(height__lte=volume_max, width__lte=volume_max, length__lte=volume_max)
        
        if date_order == 'old':
            queryset = queryset.order_by('created_at')
        else:
            queryset = queryset.order_by('-created_at')
        
        if price_order == 'cheap':
            queryset = queryset.order_by('proposed_cost')
        elif price_order == 'expensive':
            queryset = queryset.order_by('-proposed_cost')
        
        serializer = AdvertisementListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=AdvertisementCreateSerializer, responses={201: AdvertisementDetailSerializer})
    def post(self, request):
        if not IsClient().has_permission(request, self):
            return Response({'error': 'Only clients can create advertisements'}, status=status.HTTP_403_FORBIDDEN)
        
        serializer = AdvertisementCreateSerializer(data=request.data)
        if serializer.is_valid():
            advertisement = serializer.save(client=request.user)
            return Response(AdvertisementDetailSerializer(advertisement, context={'request': request}).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class AdvertisementDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: AdvertisementDetailSerializer})
    def get(self, request, pk):
        try:
            advertisement = Advertisement.objects.get(pk=pk)
            serializer = AdvertisementDetailSerializer(advertisement, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(request=AdvertisementCreateSerializer, responses={200: AdvertisementDetailSerializer})
    def put(self, request, pk):
        if not IsClient().has_permission(request, self):
            return Response({'error': 'Only clients can update advertisements'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            advertisement = Advertisement.objects.get(pk=pk, client=request.user)
            serializer = AdvertisementCreateSerializer(advertisement, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(AdvertisementDetailSerializer(advertisement, context={'request': request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        if not IsClient().has_permission(request, self):
            return Response({'error': 'Only clients can delete advertisements'}, status=status.HTTP_403_FORBIDDEN)
        
        try:
            advertisement = Advertisement.objects.get(pk=pk, client=request.user)
            advertisement.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)


class MyAdvertisementsView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    @extend_schema(responses={200: AdvertisementListSerializer(many=True)})
    def get(self, request):
        advertisements = Advertisement.objects.filter(client=request.user)
        serializer = AdvertisementListSerializer(advertisements, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdvertisementAcceptView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(
        responses={201: AdvertisementDetailSerializer},
        summary="Accept advertisement",
        description="Driver accepts an advertisement and creates an execution record"
    )
    def post(self, request, pk):
        try:
            advertisement = Advertisement.objects.get(pk=pk, is_closed=False)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found or already closed'}, status=status.HTTP_404_NOT_FOUND)
        
        if advertisement.client == request.user:
            return Response({'error': 'You cannot accept your own advertisement'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.advertisements.models import AdvertisementExecution
        from apps.orders.models import Order, OrderStatus
        
        existing_execution = AdvertisementExecution.objects.filter(
            advertisement=advertisement,
            driver=request.user
        ).first()
        
        if existing_execution:
            return Response({'error': 'You have already accepted this advertisement'}, status=status.HTTP_400_BAD_REQUEST)
        
        execution = AdvertisementExecution.objects.create(
            advertisement=advertisement,
            driver=request.user,
            client=advertisement.client
        )
        
        pending_status = OrderStatus.objects.filter(code='pending').first()
        if pending_status:
            Order.objects.create(
                advertisement=advertisement,
                driver=request.user,
                client=advertisement.client,
                status=pending_status
            )
        
        advertisement.is_closed = True
        advertisement.save()
        
        serializer = AdvertisementDetailSerializer(advertisement, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)
