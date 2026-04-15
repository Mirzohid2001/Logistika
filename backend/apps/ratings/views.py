from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Avg, Count, Q
from .models import Rating
from .serializers import RatingSerializer, RatingCreateSerializer
from apps.orders.models import Order
from apps.users.models import User


class RatingCreateView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(request=RatingCreateSerializer, responses={201: RatingSerializer})
    def post(self, request):
        serializer = RatingCreateSerializer(data=request.data)
        if serializer.is_valid():
            order_id = serializer.validated_data['order_id']
            to_user_id = serializer.validated_data['to_user_id']
            rating_value = serializer.validated_data['rating']
            comment = serializer.validated_data.get('comment', '')
            
            try:
                order = Order.objects.get(pk=order_id)
            except Order.DoesNotExist:
                return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
            
            if order.status.code != 'completed':
                return Response({'error': 'Rating can only be given for completed orders'}, status=status.HTTP_400_BAD_REQUEST)
            
            if order.driver != request.user and order.client != request.user:
                return Response({'error': 'You can only rate orders you are involved in'}, status=status.HTTP_403_FORBIDDEN)
            
            try:
                to_user = User.objects.get(pk=to_user_id)
            except User.DoesNotExist:
                return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
            
            if to_user == request.user:
                return Response({'error': 'You cannot rate yourself'}, status=status.HTTP_400_BAD_REQUEST)
            
            if order.driver != to_user and order.client != to_user:
                return Response({'error': 'User is not related to this order'}, status=status.HTTP_400_BAD_REQUEST)
            
            rating, created = Rating.objects.get_or_create(
                order=order,
                from_user=request.user,
                to_user=to_user,
                defaults={
                    'rating': rating_value,
                    'comment': comment
                }
            )
            
            if not created:
                rating.rating = rating_value
                rating.comment = comment
                rating.save()
            
            return Response(RatingSerializer(rating).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class RatingListView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses={200: RatingSerializer(many=True)})
    def get(self, request):
        user_id = request.query_params.get('user_id')
        order_id = request.query_params.get('order_id')
        
        if user_id:
            ratings = Rating.objects.filter(to_user_id=user_id)
        elif order_id:
            ratings = Rating.objects.filter(order_id=order_id)
        else:
            ratings = Rating.objects.filter(to_user=request.user)
        
        serializer = RatingSerializer(ratings, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class RatingDetailView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses={200: RatingSerializer})
    def get(self, request, pk):
        try:
            rating = Rating.objects.get(pk=pk)
            if rating.from_user != request.user and rating.to_user != request.user:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            serializer = RatingSerializer(rating, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Rating.DoesNotExist:
            return Response({'error': 'Rating not found'}, status=status.HTTP_404_NOT_FOUND)


class UserRatingStatsView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request, user_id):
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)
        
        stats = Rating.objects.filter(to_user=user).aggregate(
            average_rating=Avg('rating'),
            total_ratings=Count('id'),
            five_star=Count('id', filter=Q(rating=5)),
            four_star=Count('id', filter=Q(rating=4)),
            three_star=Count('id', filter=Q(rating=3)),
            two_star=Count('id', filter=Q(rating=2)),
            one_star=Count('id', filter=Q(rating=1)),
        )
        
        return Response({
            'user_id': user_id,
            'average_rating': round(stats['average_rating'] or 0, 2),
            'total_ratings': stats['total_ratings'] or 0,
            'rating_distribution': {
                '5': stats['five_star'] or 0,
                '4': stats['four_star'] or 0,
                '3': stats['three_star'] or 0,
                '2': stats['two_star'] or 0,
                '1': stats['one_star'] or 0,
            }
        }, status=status.HTTP_200_OK)
