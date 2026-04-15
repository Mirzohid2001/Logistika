from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsClient, IsDriver
from django.db.models import Q
from django.db import transaction
from .models import Advertisement, FavoriteAdvertisement, SavedSearch
from .serializers import AdvertisementListSerializer, AdvertisementDetailSerializer, AdvertisementCreateSerializer, FavoriteAdvertisementSerializer, SavedSearchSerializer, SavedSearchCreateSerializer


class AdvertisementListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: AdvertisementListSerializer(many=True)})
    def get(self, request):
        queryset = Advertisement.objects.filter(is_closed=False)
        
        search_query = request.query_params.get('search', '')
        country_from = request.query_params.get('country_from')
        country_to = request.query_params.get('country_to')
        city_from = request.query_params.get('city_from')
        city_to = request.query_params.get('city_to')
        volume_min = request.query_params.get('volume_min')
        volume_max = request.query_params.get('volume_max')
        weight_min = request.query_params.get('weight_min')
        weight_max = request.query_params.get('weight_max')
        cost_min = request.query_params.get('cost_min')
        cost_max = request.query_params.get('cost_max')
        is_fragile = request.query_params.get('is_fragile')
        date_order = request.query_params.get('date', 'new')
        price_order = request.query_params.get('price', None)
        
        if search_query:
            queryset = queryset.filter(
                Q(title_ru__icontains=search_query) |
                Q(title_en__icontains=search_query) |
                Q(title_uz__icontains=search_query) |
                Q(description_ru__icontains=search_query) |
                Q(description_en__icontains=search_query) |
                Q(description_uz__icontains=search_query) |
                Q(departure_address__icontains=search_query) |
                Q(destination_address__icontains=search_query)
            )
        
        if country_from:
            queryset = queryset.filter(departure_city__country_id=country_from)
        if country_to:
            queryset = queryset.filter(destination_city__country_id=country_to)
        if city_from:
            queryset = queryset.filter(departure_city_id=city_from)
        if city_to:
            queryset = queryset.filter(destination_city_id=city_to)
        if weight_min:
            queryset = queryset.filter(weight__gte=weight_min)
        if weight_max:
            queryset = queryset.filter(weight__lte=weight_max)
        if cost_min:
            queryset = queryset.filter(proposed_cost__gte=cost_min)
        if cost_max:
            queryset = queryset.filter(proposed_cost__lte=cost_max)
        if is_fragile is not None:
            queryset = queryset.filter(is_fragile=is_fragile.lower() == 'true')
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
    @transaction.atomic
    def post(self, request, pk):
        try:
            advertisement = Advertisement.objects.get(pk=pk, is_closed=False)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found or already closed'}, status=status.HTTP_404_NOT_FOUND)
        
        if advertisement.client == request.user:
            return Response({'error': 'You cannot accept your own advertisement'}, status=status.HTTP_400_BAD_REQUEST)
        
        if not request.user.is_verified:
            return Response({
                'error': 'Sizning hisobingiz hali tasdiqlanmagan. Iltimos, barcha hujjatlarni yuklang va admin tasdiqlashini kuting.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        if not request.user.document_photos or len(request.user.document_photos) == 0:
            return Response({
                'error': 'Iltimos, avval hujjatlaringizni (pasport, prava) yuklang.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.vehicles.models import Vehicle
        verified_vehicles = Vehicle.objects.filter(user=request.user, is_verified=True)
        if not verified_vehicles.exists():
            return Response({
                'error': 'Sizda tasdiqlangan transport vositasi yo\'q. Iltimos, transport vositangizni qo\'shing va barcha hujjatlarni yuklang.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.orders.models import Order, OrderStatus
        active_orders = Order.objects.filter(
            driver=request.user
        ).exclude(
            status__code__in=['completed', 'cancelled', 'rejected']
        )
        if active_orders.exists():
            return Response({
                'error': 'Sizda hozirgi vaqtda faol buyurtma mavjud. Bitta buyurtmani tugallaganingizdan keyin boshqa e\'lonlarni qabul qila olasiz.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.advertisements.models import AdvertisementExecution
        from apps.orders.models import Order, OrderStatus
        
        existing_execution = AdvertisementExecution.objects.filter(
            advertisement=advertisement,
            driver=request.user
        ).first()
        
        if existing_execution:
            return Response({'error': 'You have already accepted this advertisement'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.bids.models import Bid
        
        active_bids = Bid.objects.filter(
            advertisement=advertisement,
            is_rejected_by_client=False,
            is_rejected_by_driver=False,
            is_accepted_by_client=False
        ).exclude(driver=request.user)
        
        active_bids.update(is_rejected_by_client=True)
        
        execution = AdvertisementExecution.objects.create(
            advertisement=advertisement,
            driver=request.user,
            client=advertisement.client
        )
        
        pending_status = OrderStatus.objects.filter(code='pending').first()
        if not pending_status:
            return Response({'error': 'Pending order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        order = Order.objects.create(
            advertisement=advertisement,
            driver=request.user,
            client=advertisement.client,
            status=pending_status
        )
        
        advertisement.is_closed = True
        advertisement.save()
        
        from apps.orders.serializers import OrderSerializer
        from apps.common.services import send_notification_sms
        
        try:
            client_phone = advertisement.client.phone
            driver_name = f"{request.user.first_name} {request.user.last_name}"
            message = f"Haydovchi {driver_name} sizning e'loningizni qabul qildi. Buyurtma #{order.id} yaratildi. Iltimos, tasdiqlang."
            send_notification_sms(client_phone, message)
        except Exception as e:
            print(f"Error sending notification: {e}")
        
        order_data = OrderSerializer(order, context={'request': request}).data
        
        response_data = {
            'advertisement': AdvertisementDetailSerializer(advertisement, context={'request': request}).data,
            'order': order_data,
            'message': 'E\'lon qabul qilindi va buyurtma yaratildi'
        }
        return Response(response_data, status=status.HTTP_201_CREATED)


class FavoriteAdvertisementListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: FavoriteAdvertisementSerializer(many=True)})
    def get(self, request):
        favorites = FavoriteAdvertisement.objects.filter(user=request.user)
        serializer = FavoriteAdvertisementSerializer(favorites, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class FavoriteAdvertisementCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={201: FavoriteAdvertisementSerializer})
    def post(self, request, pk):
        try:
            advertisement = Advertisement.objects.get(pk=pk)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)
        
        try:
            favorite, created = FavoriteAdvertisement.objects.get_or_create(
                user=request.user,
                advertisement=advertisement
            )
            
            if not created:
                return Response({'error': 'Already in favorites'}, status=status.HTTP_400_BAD_REQUEST)
            
            serializer = FavoriteAdvertisementSerializer(favorite, context={'request': request})
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_400_BAD_REQUEST)


class FavoriteAdvertisementDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        try:
            favorite = FavoriteAdvertisement.objects.get(pk=pk, user=request.user)
            favorite.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except FavoriteAdvertisement.DoesNotExist:
            return Response({'error': 'Favorite not found'}, status=status.HTTP_404_NOT_FOUND)


class SavedSearchListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: SavedSearchSerializer(many=True)})
    def get(self, request):
        searches = SavedSearch.objects.filter(user=request.user)
        serializer = SavedSearchSerializer(searches, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class SavedSearchCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=SavedSearchCreateSerializer, responses={201: SavedSearchSerializer})
    def post(self, request):
        serializer = SavedSearchCreateSerializer(data=request.data)
        if serializer.is_valid():
            saved_search = serializer.save(user=request.user)
            return Response(SavedSearchSerializer(saved_search, context={'request': request}).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class SavedSearchDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: SavedSearchSerializer})
    def get(self, request, pk):
        try:
            saved_search = SavedSearch.objects.get(pk=pk, user=request.user)
            serializer = SavedSearchSerializer(saved_search, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except SavedSearch.DoesNotExist:
            return Response({'error': 'Saved search not found'}, status=status.HTTP_404_NOT_FOUND)

    @extend_schema(request=SavedSearchCreateSerializer, responses={200: SavedSearchSerializer})
    def put(self, request, pk):
        try:
            saved_search = SavedSearch.objects.get(pk=pk, user=request.user)
            serializer = SavedSearchCreateSerializer(saved_search, data=request.data, partial=True)
            if serializer.is_valid():
                serializer.save()
                return Response(SavedSearchSerializer(saved_search, context={'request': request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except SavedSearch.DoesNotExist:
            return Response({'error': 'Saved search not found'}, status=status.HTTP_404_NOT_FOUND)

    def delete(self, request, pk):
        try:
            saved_search = SavedSearch.objects.get(pk=pk, user=request.user)
            saved_search.delete()
            return Response(status=status.HTTP_204_NO_CONTENT)
        except SavedSearch.DoesNotExist:
            return Response({'error': 'Saved search not found'}, status=status.HTTP_404_NOT_FOUND)


class SavedSearchApplyView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: AdvertisementListSerializer(many=True)})
    def get(self, request, pk):
        try:
            saved_search = SavedSearch.objects.get(pk=pk, user=request.user)
        except SavedSearch.DoesNotExist:
            return Response({'error': 'Saved search not found'}, status=status.HTTP_404_NOT_FOUND)
        
        queryset = Advertisement.objects.filter(is_closed=False)
        
        if saved_search.departure_city:
            queryset = queryset.filter(departure_city=saved_search.departure_city)
        if saved_search.destination_city:
            queryset = queryset.filter(destination_city=saved_search.destination_city)
        if saved_search.min_weight:
            queryset = queryset.filter(weight__gte=saved_search.min_weight)
        if saved_search.max_weight:
            queryset = queryset.filter(weight__lte=saved_search.max_weight)
        if saved_search.min_cost:
            queryset = queryset.filter(proposed_cost__gte=saved_search.min_cost)
        if saved_search.max_cost:
            queryset = queryset.filter(proposed_cost__lte=saved_search.max_cost)
        
        if saved_search.query:
            queryset = queryset.filter(
                Q(title_ru__icontains=saved_search.query) |
                Q(title_en__icontains=saved_search.query) |
                Q(title_uz__icontains=saved_search.query) |
                Q(description_ru__icontains=saved_search.query) |
                Q(description_en__icontains=saved_search.query) |
                Q(description_uz__icontains=saved_search.query)
            )
        
        queryset = queryset.order_by('-created_at')
        
        serializer = AdvertisementListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)
