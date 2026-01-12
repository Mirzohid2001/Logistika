from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from .models import News
from .serializers import NewsListSerializer, NewsDetailSerializer


class NewsListView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: NewsListSerializer(many=True)})
    def get(self, request):
        news = News.objects.all().order_by('-date')
        serializer = NewsListSerializer(news, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class NewsDetailView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: NewsDetailSerializer})
    def get(self, request, pk):
        try:
            news = News.objects.get(pk=pk)
            serializer = NewsDetailSerializer(news, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except News.DoesNotExist:
            return Response({'error': 'News not found'}, status=status.HTTP_404_NOT_FOUND)
