from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsDriver, IsClient
from .models import Bid
from apps.advertisements.models import Advertisement
from .serializers import BidSerializer, BidCreateSerializer, BidCounterOfferSerializer


class BidCreateView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=BidCreateSerializer, responses={201: BidSerializer})
    def post(self, request):
        serializer = BidCreateSerializer(data=request.data)
        if serializer.is_valid():
            advertisement = serializer.validated_data['advertisement']
            proposed_amount = serializer.validated_data['proposed_amount']
            
            if advertisement.client == request.user:
                return Response({'error': 'You cannot create a bid for your own advertisement'}, status=status.HTTP_400_BAD_REQUEST)
            
            existing_bid = Bid.objects.filter(
                advertisement=advertisement,
                driver=request.user,
                is_rejected_by_client=False,
                is_rejected_by_driver=False,
                is_accepted_by_client=False
            ).first()
            
            if existing_bid:
                return Response({'error': 'You already have an active bid for this advertisement'}, status=status.HTTP_400_BAD_REQUEST)
            
            proposed_amount_str = str(proposed_amount)
            bid = Bid.objects.create(
                advertisement=advertisement,
                client=advertisement.client,
                driver=request.user,
                proposed_amounts=[{'amount': proposed_amount_str, 'by': 'driver', 'timestamp': None}],
                is_driver_agreed_to_amount=(proposed_amount == advertisement.proposed_cost) if advertisement.proposed_cost else False,
                last_counter_by='driver'
            )
            return Response(BidSerializer(bid).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class BidAcceptPriceView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    @extend_schema(responses={200: BidSerializer})
    def post(self, request, pk):
        try:
            bid = Bid.objects.get(pk=pk, client=request.user)
            
            if bid.is_accepted_by_client:
                return Response({'error': 'Bid is already accepted'}, status=status.HTTP_400_BAD_REQUEST)
            
            if bid.is_rejected_by_client:
                return Response({'error': 'Bid is already rejected'}, status=status.HTTP_400_BAD_REQUEST)
            
            if bid.is_rejected_by_driver:
                return Response({'error': 'Bid is rejected by driver'}, status=status.HTTP_400_BAD_REQUEST)
            
            bid.is_accepted_by_client = True
            bid.save()
            
            from apps.orders.models import Order, OrderStatus
            from apps.advertisements.models import AdvertisementExecution
            
            advertisement = bid.advertisement
            advertisement.is_closed = True
            advertisement.save()
            
            other_bids = Bid.objects.filter(advertisement=advertisement).exclude(pk=bid.pk)
            other_bids.update(is_rejected_by_client=True)
            
            new_status = OrderStatus.objects.get(code='new')
            order = Order.objects.create(
                advertisement=advertisement,
                driver=bid.driver,
                client=bid.client,
                status=new_status
            )
            
            AdvertisementExecution.objects.create(
                advertisement=advertisement,
                driver=bid.driver,
                client=bid.client,
                is_rejected_by_driver=False
            )
            
            return Response(BidSerializer(bid).data, status=status.HTTP_200_OK)
        except Bid.DoesNotExist:
            return Response({'error': 'Bid not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class BidRejectView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: BidSerializer})
    def post(self, request, pk):
        try:
            bid = Bid.objects.get(pk=pk)
            
            if request.user == bid.client:
                if bid.is_accepted_by_client or bid.is_rejected_by_client:
                    return Response({'error': 'Bid is already processed'}, status=status.HTTP_400_BAD_REQUEST)
                bid.is_rejected_by_client = True
            elif request.user == bid.driver:
                if bid.is_rejected_by_driver:
                    return Response({'error': 'Bid is already rejected by driver'}, status=status.HTTP_400_BAD_REQUEST)
                bid.is_rejected_by_driver = True
            else:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
            bid.save()
            return Response(BidSerializer(bid).data, status=status.HTTP_200_OK)
        except Bid.DoesNotExist:
            return Response({'error': 'Bid not found'}, status=status.HTTP_404_NOT_FOUND)


class BidCounterOfferView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=BidCounterOfferSerializer, responses={200: BidSerializer})
    def post(self, request, pk):
        serializer = BidCounterOfferSerializer(data=request.data)
        if serializer.is_valid():
            try:
                bid = Bid.objects.get(pk=pk)
                amount = serializer.validated_data['amount']
                
                from django.utils import timezone
                amount_str = str(amount)
                
                if request.user == bid.client:
                    if not bid.can_counter_offer_by_client():
                        return Response({'error': 'You cannot make a counter-offer at this time'}, status=status.HTTP_400_BAD_REQUEST)
                    
                    bid.proposed_amounts.append({
                        'amount': amount_str,
                        'by': 'client',
                        'timestamp': timezone.now().isoformat()
                    })
                    bid.is_driver_agreed_to_amount = False
                    bid.last_counter_by = 'client'
                    bid.is_rejected_by_client = False
                    
                elif request.user == bid.driver:
                    if not bid.can_counter_offer_by_driver():
                        return Response({'error': 'You cannot make a counter-offer at this time'}, status=status.HTTP_400_BAD_REQUEST)
                    
                    bid.proposed_amounts.append({
                        'amount': amount_str,
                        'by': 'driver',
                        'timestamp': timezone.now().isoformat()
                    })
                    bid.is_driver_agreed_to_amount = False
                    bid.last_counter_by = 'driver'
                    bid.is_rejected_by_driver = False
                    
                else:
                    return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
                
                bid.save()
                return Response(BidSerializer(bid).data, status=status.HTTP_200_OK)
            except Bid.DoesNotExist:
                return Response({'error': 'Bid not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class MyBidsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: BidSerializer(many=True)})
    def get(self, request):
        bids = Bid.objects.filter(driver=request.user) | Bid.objects.filter(client=request.user)
        serializer = BidSerializer(bids, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class AdvertisementBidsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: BidSerializer(many=True)})
    def get(self, request, advertisement_id):
        try:
            advertisement = Advertisement.objects.get(pk=advertisement_id)
            bids = Bid.objects.filter(advertisement=advertisement)
            serializer = BidSerializer(bids, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Advertisement.DoesNotExist:
            return Response({'error': 'Advertisement not found'}, status=status.HTTP_404_NOT_FOUND)
