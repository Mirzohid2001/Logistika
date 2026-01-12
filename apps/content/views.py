from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from drf_spectacular.utils import extend_schema
from .models import StaticContent
from .serializers import StaticContentSerializer


class PublicOfferView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: StaticContentSerializer})
    def get(self, request):
        try:
            content = StaticContent.objects.get(content_type='public_offer')
            serializer = StaticContentSerializer(content, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except StaticContent.DoesNotExist:
            return Response({'error': 'Content not found'}, status=status.HTTP_404_NOT_FOUND)


class DisclaimerView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: StaticContentSerializer})
    def get(self, request):
        try:
            content = StaticContent.objects.get(content_type='disclaimer')
            serializer = StaticContentSerializer(content, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except StaticContent.DoesNotExist:
            return Response({'error': 'Content not found'}, status=status.HTTP_404_NOT_FOUND)


class GuideClientsView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: StaticContentSerializer})
    def get(self, request):
        try:
            content = StaticContent.objects.get(content_type='guide_clients')
            serializer = StaticContentSerializer(content, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except StaticContent.DoesNotExist:
            return Response({'error': 'Content not found'}, status=status.HTTP_404_NOT_FOUND)


class GuideDriversView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: StaticContentSerializer})
    def get(self, request):
        try:
            content = StaticContent.objects.get(content_type='guide_drivers')
            serializer = StaticContentSerializer(content, context={'request': request})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except StaticContent.DoesNotExist:
            return Response({'error': 'Content not found'}, status=status.HTTP_404_NOT_FOUND)
