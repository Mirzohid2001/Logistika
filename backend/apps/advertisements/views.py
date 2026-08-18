from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated, AllowAny
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsClient, IsDriver
from django.db.models import Q
from django.db.models import Case, When, Value, IntegerField
from django.db import transaction
import logging
from .models import Advertisement, FavoriteAdvertisement, SavedSearch, DriverAvailability, DriverLane
from apps.orders.models import Order
from apps.orders.services import order_pricing_kwargs
from .serializers import AdvertisementListSerializer, AdvertisementDetailSerializer, AdvertisementCreateSerializer, FavoriteAdvertisementSerializer, SavedSearchSerializer, SavedSearchCreateSerializer
from apps.notifications.services import create_notification

logger = logging.getLogger(__name__)


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
        trust_order = request.query_params.get('trust', None)
        nearby_for_driver = request.query_params.get('nearby') in ['1', 'true', 'True']
        
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
        cargo_category = request.query_params.get('cargo_category')
        body_type = request.query_params.get('body_type') or request.query_params.get('required_body_type')
        if cargo_category:
            queryset = queryset.filter(cargo_category=cargo_category)
        if body_type:
            queryset = queryset.filter(required_body_type=body_type)
        if request.query_params.get('requires_adr') in ['1', 'true', 'True']:
            queryset = queryset.filter(requires_adr=True)
        if request.query_params.get('requires_reefer') in ['1', 'true', 'True']:
            queryset = queryset.filter(requires_reefer=True)
        if request.query_params.get('is_heavy') in ['1', 'true', 'True']:
            queryset = queryset.filter(is_heavy=True)
        if is_fragile is not None:
            if is_fragile.lower() == 'true':
                queryset = queryset.filter(cargo_category='fragile')
            else:
                queryset = queryset.exclude(cargo_category='fragile')
        if volume_min:
            queryset = queryset.filter(volume_m3__gte=volume_min)
        if volume_max:
            queryset = queryset.filter(volume_m3__lte=volume_max)

        sort_parts = []
        if price_order == 'cheap':
            sort_parts.append('proposed_cost')
        elif price_order == 'expensive':
            sort_parts.append('-proposed_cost')
        if date_order == 'old':
            sort_parts.append('created_at')
        else:
            sort_parts.append('-created_at')
        if sort_parts:
            queryset = queryset.order_by(*sort_parts)

        if nearby_for_driver and request.user.is_authenticated and getattr(request.user, 'is_driver', False):
            from apps.orders.models import Order
            from apps.advertisements.models import AdvertisementExecution

            recent_order_city_ids = list(
                Order.objects.filter(driver=request.user)
                .values_list('advertisement__departure_city_id', flat=True)[:30]
            ) + list(
                Order.objects.filter(driver=request.user)
                .values_list('advertisement__destination_city_id', flat=True)[:30]
            )
            recent_execution_city_ids = list(
                AdvertisementExecution.objects.filter(driver=request.user)
                .values_list('advertisement__departure_city_id', flat=True)[:30]
            )

            preferred_city_ids = [c for c in (recent_order_city_ids + recent_execution_city_ids) if c]
            if preferred_city_ids:
                nearby_order = ['nearby_priority', *(sort_parts or ['-created_at'])]
                queryset = queryset.annotate(
                    nearby_priority=Case(
                        When(departure_city_id__in=preferred_city_ids, then=Value(0)),
                        When(destination_city_id__in=preferred_city_ids, then=Value(1)),
                        default=Value(2),
                        output_field=IntegerField(),
                    )
                ).order_by(*nearby_order)
        
        if trust_order in ('high', 'low'):
            from apps.users.trust import sort_entities_by_user_trust

            sorted_items = sort_entities_by_user_trust(
                list(queryset.select_related('client')),
                'client',
                reverse=(trust_order == 'high'),
            )
            serializer = AdvertisementListSerializer(sorted_items, many=True, context={'request': request})
        else:
            serializer = AdvertisementListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=AdvertisementCreateSerializer, responses={201: AdvertisementDetailSerializer})
    def post(self, request):
        if not IsClient().has_permission(request, self):
            return Response({'error': 'Only clients can create advertisements'}, status=status.HTTP_403_FORBIDDEN)

        from apps.users.inn import normalize_company_inn
        from apps.users.enforcement import marketplace_ban_reason, user_is_marketplace_banned
        if user_is_marketplace_banned(request.user):
            return Response({
                'error': marketplace_ban_reason(request.user) or 'Hisob cheklangan',
                'code': 'account_restricted',
            }, status=status.HTTP_403_FORBIDDEN)
        if not normalize_company_inn(request.user.company_inn):
            return Response({
                'error': 'Korxona STIR raqamini profilga kiriting',
                'code': 'company_inn_required',
            }, status=status.HTTP_403_FORBIDDEN)

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
            from apps.orders.services import advertisement_has_active_order

            if advertisement.is_closed or advertisement_has_active_order(advertisement.id):
                return Response(
                    {'error': 'Faol buyurtmasi bor yoki yopilgan e\'lonni tahrirlab bo\'lmaydi.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
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
            from apps.orders.services import advertisement_has_active_order

            if advertisement_has_active_order(advertisement.id):
                return Response(
                    {'error': 'Faol buyurtmasi bor e\'lonni o\'chirib bo\'lmaydi.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
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
            advertisement = Advertisement.objects.select_for_update().get(pk=pk, is_closed=False)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found or already closed'}, status=status.HTTP_404_NOT_FOUND)

        from apps.orders.services import advertisement_has_active_order, driver_has_active_order
        if advertisement_has_active_order(advertisement.id):
            return Response({
                'error': 'Bu e\'lon bo\'yicha allaqachon faol buyurtma mavjud.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if advertisement.client == request.user:
            return Response({'error': 'You cannot accept your own advertisement'}, status=status.HTTP_400_BAD_REQUEST)
        
        from apps.users.verification import is_driver_marketplace_eligible, driver_has_approved_vehicle
        if not is_driver_marketplace_eligible(request.user):
            return Response({
                'error': 'Sizning hisobingiz hali tasdiqlanmagan. Iltimos, barcha hujjatlarni yuklang va admin tasdiqlashini kuting.'
            }, status=status.HTTP_403_FORBIDDEN)
        
        if not request.user.document_photos or len(request.user.document_photos) == 0:
            return Response({
                'error': 'Iltimos, avval hujjatlaringizni (pasport, prava) yuklang.'
            }, status=status.HTTP_400_BAD_REQUEST)

        from apps.users.document_expiry import document_expiry_forbidden_response
        blocked = document_expiry_forbidden_response(request.user)
        if blocked:
            return blocked
        
        if not driver_has_approved_vehicle(request.user):
            return Response({
                'error': 'Sizda tasdiqlangan transport vositasi yo\'q. Iltimos, transport vositangizni qo\'shing va barcha hujjatlarni yuklang.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if driver_has_active_order(request.user.id):
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

        Bid.objects.filter(
            advertisement=advertisement,
            driver=request.user,
        ).update(is_accepted_by_client=True, is_rejected_by_client=False)
        
        execution = AdvertisementExecution.objects.create(
            advertisement=advertisement,
            driver=request.user,
            proposed_cost=advertisement.proposed_cost or 0,
        )
        
        pending_status = OrderStatus.objects.filter(code='pending').first()
        if not pending_status:
            return Response({'error': 'Pending order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        from apps.subscriptions.trial import ensure_marketplace_action_allowed, consume_trial_for_order
        try:
            ensure_marketplace_action_allowed(advertisement.client)
            ensure_marketplace_action_allowed(request.user)
        except Exception as exc:
            from apps.common.exceptions import PermissionDeniedError
            if isinstance(exc, PermissionDeniedError):
                return Response(
                    {'error': str(exc.detail), 'code': getattr(exc, 'code', 'subscription_required')},
                    status=status.HTTP_403_FORBIDDEN,
                )
            raise

        from apps.orders.services import resolve_agreed_amount
        agreed_amount = resolve_agreed_amount(advertisement=advertisement)
        if agreed_amount is None or agreed_amount <= 0:
            return Response(
                {'error': 'Buyurtma yaratish uchun narx 0 dan katta bo\'lishi kerak'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        order = Order.objects.create(
            advertisement=advertisement,
            driver=request.user,
            client=advertisement.client,
            status=pending_status,
            **order_pricing_kwargs(advertisement=advertisement),
        )
        from apps.orders.route_stops import ensure_default_route_stops
        ensure_default_route_stops(order)

        advertisement.is_closed = True
        advertisement.save()

        consume_trial_for_order(order)
        
        from apps.orders.serializers import OrderSerializer
        from apps.common.services import send_notification_sms
        
        driver_name = f"{request.user.first_name} {request.user.last_name}".strip() or request.user.phone
        client_message = (
            f"Haydovchi {driver_name} e'loningizni qabul qildi. "
            f"Buyurtma #{order.id} yaratildi. Iltimos, tasdiqlang."
        )
        
        create_notification(
            user=advertisement.client,
            notification_type='order_created',
            title="Haydovchi e'lonni qabul qildi",
            message=client_message,
            order=order,
            advertisement=advertisement,
        )
        create_notification(
            user=request.user,
            notification_type='order_accepted',
            title="E'lon qabul qilindi",
            message=f"Buyurtma #{order.id} yaratildi. Mijoz tasdiqlashini kuting.",
            order=order,
            advertisement=advertisement,
        )
        
        try:
            send_notification_sms(advertisement.client.phone, client_message)
        except Exception:
            logger.exception(
                'Failed to send advertisement accept SMS',
                extra={'event': 'ad_accept_sms_failed'},
            )
        
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
        from apps.advertisements.saved_search_matching import apply_saved_search_to_queryset

        queryset = apply_saved_search_to_queryset(queryset, saved_search)
        queryset = queryset.order_by('-created_at')
        
        serializer = AdvertisementListSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class PriceInsightView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from decimal import Decimal, InvalidOperation
        from .market_insight import get_lane_price_insight

        from_city = request.query_params.get('from_city')
        to_city = request.query_params.get('to_city')
        if not from_city or not to_city:
            return Response(
                {'error': 'from_city va to_city talab qilinadi'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        weight = None
        raw_weight = request.query_params.get('weight')
        if raw_weight:
            try:
                weight = Decimal(str(raw_weight))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'weight noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)

        payload = get_lane_price_insight(int(from_city), int(to_city), weight)
        return Response(payload, status=status.HTTP_200_OK)


class BackhaulMatchesView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def get(self, request):
        from .backhaul import get_backhaul_matches

        limit = request.query_params.get('limit')
        try:
            limit_value = int(limit) if limit else 8
        except (TypeError, ValueError):
            limit_value = 8
        payload = get_backhaul_matches(request.user, limit=max(1, min(limit_value, 20)))
        return Response(payload, status=status.HTTP_200_OK)


class AdvertisementTripEstimateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        from decimal import Decimal, InvalidOperation
        from .trip_estimate import estimate_trip_profit

        try:
            advertisement = Advertisement.objects.get(pk=pk)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)

        amount = request.query_params.get('amount') or advertisement.proposed_cost
        if amount is None:
            return Response({'error': 'amount talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            revenue = Decimal(str(amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'amount noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)

        payload = estimate_trip_profit(
            advertisement.departure_city_id,
            advertisement.destination_city_id,
            revenue,
        )
        return Response(payload, status=status.HTTP_200_OK)


class AdvertisementLoadFitView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def get(self, request, pk):
        from decimal import Decimal
        from .load_fit import check_driver_load_fit

        try:
            advertisement = Advertisement.objects.get(pk=pk, is_closed=False)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)

        payload = check_driver_load_fit(
            request.user,
            Decimal(str(advertisement.weight)),
            Decimal(str(advertisement.volume_m3)) if advertisement.volume_m3 is not None else None,
            advertisement=advertisement,
        )
        return Response(payload, status=status.HTTP_200_OK)


class AdvertisementReorderFromOrderView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    def post(self, request, order_id):
        from .reorder import duplicate_advertisement_from_order

        try:
            order = Order.objects.select_related('advertisement', 'status').get(
                pk=order_id,
                client=request.user,
            )
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.status.code != 'completed':
            return Response(
                {'error': 'Faqat yakunlangan buyurtmadan qayta e\'lon yaratish mumkin'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        advertisement = duplicate_advertisement_from_order(order)
        return Response(
            AdvertisementDetailSerializer(advertisement, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class RouteHealthView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        from decimal import Decimal, InvalidOperation
        from .market_signal import get_route_health

        from_city = request.query_params.get('from_city')
        to_city = request.query_params.get('to_city')
        if not from_city or not to_city:
            return Response({'error': 'from_city va to_city talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

        weight = None
        raw_weight = request.query_params.get('weight')
        if raw_weight:
            try:
                weight = Decimal(str(raw_weight))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'weight noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)

        payload = get_route_health(int(from_city), int(to_city), weight)
        return Response(payload, status=status.HTTP_200_OK)


class DuplicateRiskView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    def get(self, request):
        from decimal import Decimal, InvalidOperation
        from .market_signal import get_duplicate_risk

        from_city = request.query_params.get('from_city')
        to_city = request.query_params.get('to_city')
        if not from_city or not to_city:
            return Response({'error': 'from_city va to_city talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)

        weight = None
        proposed_cost = None
        raw_weight = request.query_params.get('weight')
        raw_cost = request.query_params.get('proposed_cost')
        if raw_weight:
            try:
                weight = Decimal(str(raw_weight))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'weight noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)
        if raw_cost:
            try:
                proposed_cost = Decimal(str(raw_cost))
            except (InvalidOperation, TypeError, ValueError):
                return Response({'error': 'proposed_cost noto\'g\'ri'}, status=status.HTTP_400_BAD_REQUEST)

        payload = get_duplicate_risk(
            user=request.user,
            from_city_id=int(from_city),
            to_city_id=int(to_city),
            weight=weight,
            proposed_cost=proposed_cost,
        )
        return Response(payload, status=status.HTTP_200_OK)


class DriverMatchesView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def get(self, request):
        from .driver_matching import get_driver_matches

        limit = request.query_params.get('limit')
        try:
            limit_value = int(limit) if limit else 20
        except (TypeError, ValueError):
            limit_value = 20
        backhaul_only = request.query_params.get('backhaul') in ['1', 'true', 'True']
        payload = get_driver_matches(
            request.user,
            limit=max(1, min(limit_value, 40)),
            backhaul_only=backhaul_only,
        )
        return Response(payload, status=status.HTTP_200_OK)


class DriverAvailabilityView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def get(self, request):
        from .driver_matching import _public_availability, resolve_availability

        return Response(_public_availability(resolve_availability(request.user)))

    def patch(self, request):
        from django.utils.dateparse import parse_datetime
        from .driver_matching import _public_availability, resolve_availability

        row, _ = DriverAvailability.objects.get_or_create(user=request.user)
        status_value = request.data.get('status')
        if status_value in {
            DriverAvailability.STATUS_AVAILABLE,
            DriverAvailability.STATUS_BUSY,
            DriverAvailability.STATUS_SCHEDULED,
        }:
            row.status = status_value
        if 'available_from' in request.data:
            raw = request.data.get('available_from')
            row.available_from = parse_datetime(str(raw)) if raw else None
        if 'current_city' in request.data:
            city_id = request.data.get('current_city')
            row.current_city_id = int(city_id) if city_id else None
        if 'note' in request.data:
            row.note = str(request.data.get('note') or '')[:255]
        if row.status == DriverAvailability.STATUS_AVAILABLE:
            row.available_from = None
        if row.status == DriverAvailability.STATUS_SCHEDULED and not row.available_from:
            return Response(
                {'error': 'scheduled holat uchun available_from kerak'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        row.save()
        return Response(_public_availability(resolve_availability(request.user)))


class DriverLaneListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def get(self, request):
        from .driver_matching import _serialize_lane

        lanes = DriverLane.objects.filter(user=request.user).select_related(
            'departure_city', 'destination_city',
        )
        return Response({'lanes': [_serialize_lane(lane) for lane in lanes]})

    def post(self, request):
        from .driver_matching import _parse_hour, _serialize_lane

        departure_city = request.data.get('departure_city')
        destination_city = request.data.get('destination_city')
        if not departure_city or not destination_city:
            return Response({'error': 'Yo\'nalish shaharlari talab qilinadi'}, status=status.HTTP_400_BAD_REQUEST)
        if int(departure_city) == int(destination_city):
            return Response({'error': 'Qayerdan va qayerga bir xil bo\'lmasin'}, status=status.HTTP_400_BAD_REQUEST)
        weekdays = request.data.get('weekdays') or []
        if not isinstance(weekdays, list):
            return Response({'error': 'weekdays ro\'yxat bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)
        clean_days = sorted({int(day) for day in weekdays if str(day).isdigit() and 1 <= int(day) <= 7})
        raw_backhaul = request.data.get('include_backhaul', True)
        if isinstance(raw_backhaul, str):
            include_backhaul = raw_backhaul.lower() in ('1', 'true', 'yes')
        else:
            include_backhaul = bool(raw_backhaul)
        time_from = _parse_hour(request.data.get('time_from_hour')) if 'time_from_hour' in request.data else None
        time_to = _parse_hour(request.data.get('time_to_hour')) if 'time_to_hour' in request.data else None
        if 'time_from_hour' in request.data and request.data.get('time_from_hour') not in (None, '') and time_from is None:
            return Response({'error': 'time_from_hour 0–23 oralig\'ida bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)
        if 'time_to_hour' in request.data and request.data.get('time_to_hour') not in (None, '') and time_to is None:
            return Response({'error': 'time_to_hour 0–23 oralig\'ida bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)
        lane = DriverLane.objects.create(
            user=request.user,
            departure_city_id=int(departure_city),
            destination_city_id=int(destination_city),
            weekdays=clean_days,
            include_backhaul=include_backhaul,
            time_from_hour=time_from,
            time_to_hour=time_to,
        )
        return Response(_serialize_lane(lane), status=status.HTTP_201_CREATED)


class DriverLaneDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    def patch(self, request, pk):
        from .driver_matching import _parse_hour, _serialize_lane

        lane = DriverLane.objects.filter(pk=pk, user=request.user).select_related(
            'departure_city', 'destination_city',
        ).first()
        if not lane:
            return Response({'error': 'Yo\'nalish topilmadi'}, status=status.HTTP_404_NOT_FOUND)

        if 'weekdays' in request.data:
            weekdays = request.data.get('weekdays') or []
            if not isinstance(weekdays, list):
                return Response({'error': 'weekdays ro\'yxat bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)
            lane.weekdays = sorted({int(day) for day in weekdays if str(day).isdigit() and 1 <= int(day) <= 7})
        if 'include_backhaul' in request.data:
            raw = request.data.get('include_backhaul')
            if isinstance(raw, str):
                lane.include_backhaul = raw.lower() in ('1', 'true', 'yes')
            else:
                lane.include_backhaul = bool(raw)
        if 'is_active' in request.data:
            raw = request.data.get('is_active')
            if isinstance(raw, str):
                lane.is_active = raw.lower() in ('1', 'true', 'yes')
            else:
                lane.is_active = bool(raw)
        if 'time_from_hour' in request.data:
            raw = request.data.get('time_from_hour')
            if raw in (None, ''):
                lane.time_from_hour = None
            else:
                parsed = _parse_hour(raw)
                if parsed is None:
                    return Response(
                        {'error': 'time_from_hour 0–23 oralig\'ida bo\'lishi kerak'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lane.time_from_hour = parsed
        if 'time_to_hour' in request.data:
            raw = request.data.get('time_to_hour')
            if raw in (None, ''):
                lane.time_to_hour = None
            else:
                parsed = _parse_hour(raw)
                if parsed is None:
                    return Response(
                        {'error': 'time_to_hour 0–23 oralig\'ida bo\'lishi kerak'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                lane.time_to_hour = parsed
        lane.save()
        return Response(_serialize_lane(lane))

    def delete(self, request, pk):
        deleted, _ = DriverLane.objects.filter(pk=pk, user=request.user).delete()
        if not deleted:
            return Response({'error': 'Yo\'nalish topilmadi'}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
