from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from apps.users.permissions import IsDriver, IsClient
from django.utils import timezone
from .models import Order, OrderStatus, OrderLocationTrack
from .serializers import OrderSerializer, OrderLocationUpdateSerializer, OrderLocationTrackSerializer


class OrderListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer(many=True)})
    def get(self, request):
        orders = Order.objects.filter(driver=request.user) | Order.objects.filter(client=request.user)
        serializer = OrderSerializer(orders, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class OrderDetailView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: OrderSerializer})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
            if order.driver != request.user and order.client != request.user:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            serializer = OrderSerializer(order, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderStartView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            in_progress_status = OrderStatus.objects.get(code='in_progress')
            order.status = in_progress_status
            order.started_at = timezone.now()
            order.save()
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderStopView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            stopped_status = OrderStatus.objects.get(code='stopped')
            order.status = stopped_status
            order.save()
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderCompleteView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            completed_status = OrderStatus.objects.get(code='completed')
            order.status = completed_status
            order.completed_at = timezone.now()
            order.save()
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderRejectView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: OrderSerializer})
    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, driver=request.user)
            rejected_status = OrderStatus.objects.get(code='rejected')
            order.status = rejected_status
            order.advertisement.is_closed = False
            order.advertisement.save()
            order.save()
            return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        except OrderStatus.DoesNotExist:
            return Response({'error': 'Order status not found'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class OrderTrackView(APIView):
    permission_classes = [IsAuthenticated, IsClient]

    @extend_schema(responses={200: OrderLocationTrackSerializer(many=True)})
    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk, client=request.user)
            tracks = OrderLocationTrack.objects.filter(order=order).order_by('-timestamp')[:10]
            serializer = OrderLocationTrackSerializer(tracks, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)


class OrderUpdateLocationView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=OrderLocationUpdateSerializer, responses={200: OrderSerializer})
    def post(self, request, pk):
        serializer = OrderLocationUpdateSerializer(data=request.data)
        if serializer.is_valid():
            try:
                order = Order.objects.get(pk=pk, driver=request.user)
                lat = serializer.validated_data['lat']
                lng = serializer.validated_data['lng']
                
                order.current_location_lat = lat
                order.current_location_lng = lng
                order.save()
                
                OrderLocationTrack.objects.create(order=order, lat=lat, lng=lng)
                
                return Response(OrderSerializer(order, context={'request': request}).data, status=status.HTTP_200_OK)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
