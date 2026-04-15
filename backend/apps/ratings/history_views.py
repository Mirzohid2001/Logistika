from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.db.models import Avg, Count, Q
from django.utils import timezone
from datetime import datetime, timedelta
from .models import Rating
from .serializers import RatingSerializer


class ReviewsHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            {'name': 'user_id', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
            {'name': 'date_from', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'date_to', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'format': 'date'}},
            {'name': 'rating', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
        ],
        responses={200: RatingSerializer(many=True)}
    )
    def get(self, request):
        user_id = request.query_params.get('user_id')
        date_from = request.query_params.get('date_from')
        date_to = request.query_params.get('date_to')
        rating_filter = request.query_params.get('rating')

        if user_id:
            ratings = Rating.objects.filter(to_user_id=user_id)
        else:
            ratings = Rating.objects.filter(
                Q(from_user=request.user) | Q(to_user=request.user)
            )

        if date_from:
            try:
                date_from = datetime.strptime(date_from, '%Y-%m-%d').date()
                ratings = ratings.filter(created_at__date__gte=date_from)
            except ValueError:
                return Response({'error': 'Invalid date_from format'}, status=status.HTTP_400_BAD_REQUEST)

        if date_to:
            try:
                date_to = datetime.strptime(date_to, '%Y-%m-%d').date()
                ratings = ratings.filter(created_at__date__lte=date_to)
            except ValueError:
                return Response({'error': 'Invalid date_to format'}, status=status.HTTP_400_BAD_REQUEST)

        if rating_filter:
            try:
                rating_value = int(rating_filter)
                if rating_value not in [1, 2, 3, 4, 5]:
                    return Response({'error': 'Rating must be between 1 and 5'}, status=status.HTTP_400_BAD_REQUEST)
                ratings = ratings.filter(rating=rating_value)
            except ValueError:
                return Response({'error': 'Invalid rating format'}, status=status.HTTP_400_BAD_REQUEST)

        serializer = RatingSerializer(ratings.order_by('-created_at'), many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ReviewsStatisticsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        parameters=[
            {'name': 'user_id', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        user_id = request.query_params.get('user_id', request.user.id)

        received_ratings = Rating.objects.filter(to_user_id=user_id)
        given_ratings = Rating.objects.filter(from_user_id=user_id)

        received_stats = received_ratings.aggregate(
            average_rating=Avg('rating'),
            total_ratings=Count('id'),
            five_star=Count('id', filter=Q(rating=5)),
            four_star=Count('id', filter=Q(rating=4)),
            three_star=Count('id', filter=Q(rating=3)),
            two_star=Count('id', filter=Q(rating=2)),
            one_star=Count('id', filter=Q(rating=1)),
        )

        given_stats = given_ratings.aggregate(
            average_rating=Avg('rating'),
            total_ratings=Count('id'),
        )

        monthly_stats = []
        for i in range(6):
            month_start = timezone.now().date().replace(day=1) - timedelta(days=30 * i)
            month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            month_ratings = received_ratings.filter(
                created_at__date__gte=month_start,
                created_at__date__lte=month_end
            )
            monthly_stats.append({
                'month': month_start.strftime('%Y-%m'),
                'count': month_ratings.count(),
                'average': float(month_ratings.aggregate(avg=Avg('rating'))['avg'] or 0)
            })
        monthly_stats.reverse()

        return Response({
            'received': {
                'average_rating': round(received_stats['average_rating'] or 0, 2),
                'total_ratings': received_stats['total_ratings'] or 0,
                'rating_distribution': {
                    '5': received_stats['five_star'] or 0,
                    '4': received_stats['four_star'] or 0,
                    '3': received_stats['three_star'] or 0,
                    '2': received_stats['two_star'] or 0,
                    '1': received_stats['one_star'] or 0,
                }
            },
            'given': {
                'average_rating': round(given_stats['average_rating'] or 0, 2),
                'total_ratings': given_stats['total_ratings'] or 0,
            },
            'monthly_statistics': monthly_stats
        }, status=status.HTTP_200_OK)


class ReviewsRecommendationsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        user_ratings = Rating.objects.filter(to_user=request.user)
        
        if not user_ratings.exists():
            return Response({
                'recommendations': [
                    'Sizga hali baho qo\'yilmagan. Buyurtmalarni muvaffaqiyatli yakunlang va baholarni oling.'
                ]
            }, status=status.HTTP_200_OK)

        avg_rating = user_ratings.aggregate(avg=Avg('rating'))['avg'] or 0
        low_ratings = user_ratings.filter(rating__lte=3).count()
        total_ratings = user_ratings.count()
        low_rating_percentage = (low_ratings / total_ratings * 100) if total_ratings > 0 else 0

        recommendations = []

        if avg_rating < 4.0:
            recommendations.append('O\'rtacha reytingingizni oshirish uchun buyurtmalarni vaqtida va sifatli bajarishga harakat qiling.')

        if low_rating_percentage > 30:
            recommendations.append('Past baholarni kamaytirish uchun mijozlar bilan yaxshiroq muloqot qiling va ularning talablariga e\'tibor bering.')

        recent_low_ratings = user_ratings.filter(
            rating__lte=3,
            created_at__gte=timezone.now() - timedelta(days=30)
        ).count()

        if recent_low_ratings > 0:
            recommendations.append('So\'nggi oyda past baholar olgan ekansiz. Xizmat sifatini yaxshilashga harakat qiling.')

        comments_with_low_rating = user_ratings.filter(
            rating__lte=3,
            comment__isnull=False
        ).exclude(comment='')[:5]

        if comments_with_low_rating.exists():
            recommendations.append('Mijozlar izohlarini o\'qib chiqing va ularning takliflarini hisobga oling.')

        if avg_rating >= 4.5 and total_ratings >= 10:
            recommendations.append('Ajoyib! Siz yuqori reytingga egasiz. Bu darajani saqlab qolishga harakat qiling.')

        if not recommendations:
            recommendations.append('Sizning reytingingiz yaxshi. Davom eting!')

        return Response({
            'recommendations': recommendations,
            'current_stats': {
                'average_rating': round(avg_rating, 2),
                'total_ratings': total_ratings,
                'low_ratings_count': low_ratings,
                'low_rating_percentage': round(low_rating_percentage, 2)
            }
        }, status=status.HTTP_200_OK)
