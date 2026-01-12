from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from .models import User
from .serializers import UserSerializer, UserRegisterSerializer, UserProfileUpdateSerializer


class RegisterView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(request=UserRegisterSerializer, responses={201: UserSerializer})
    def post(self, request):
        serializer = UserRegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses={200: UserSerializer})
    def post(self, request):
        phone = request.data.get('phone')
        password = request.data.get('password')
        
        if not phone or not password:
            return Response({'error': 'Phone and password are required'}, status=status.HTTP_400_BAD_REQUEST)
        
        user = authenticate(request, username=phone, password=password)
        
        if user is None:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
        
        if user.is_blocked:
            return Response({'error': 'User is blocked'}, status=status.HTTP_403_FORBIDDEN)
        
        refresh = RefreshToken.for_user(user)
        return Response({
            'user': UserSerializer(user).data,
            'refresh': str(refresh),
            'access': str(refresh.access_token),
        }, status=status.HTTP_200_OK)


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request={'type': 'object', 'properties': {'refresh': {'type': 'string'}}},
        responses={200: {'type': 'object', 'properties': {'access': {'type': 'string'}}}, 400: {'type': 'object', 'properties': {'error': {'type': 'string'}}}, 401: {'type': 'object', 'properties': {'error': {'type': 'string'}}}},
        summary="Refresh access token",
        description="Get new access token using refresh token"
    )
    def post(self, request):
        refresh_token = request.data.get('refresh')
        if not refresh_token:
            return Response({'error': 'Refresh token is required'}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            refresh = RefreshToken(refresh_token)
            return Response({
                'access': str(refresh.access_token),
            }, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({'error': 'Invalid or expired refresh token'}, status=status.HTTP_401_UNAUTHORIZED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: UserSerializer})
    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=UserProfileUpdateSerializer, responses={200: UserSerializer})
    def put(self, request):
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(UserSerializer(request.user).data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class UserVehiclesView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses={200: 'apps.vehicles.serializers.VehicleSerializer'})
    def get(self, request):
        from apps.vehicles.models import Vehicle
        from apps.vehicles.serializers import VehicleSerializer
        vehicles = Vehicle.objects.filter(user=request.user)
        serializer = VehicleSerializer(vehicles, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class UserEarningsView(APIView):
    permission_classes = [IsAuthenticated]
    
    @extend_schema(responses={200: {'type': 'object', 'properties': {'completed_orders': {'type': 'integer'}, 'total_earnings': {'type': 'number'}}}})
    def get(self, request):
        from apps.orders.models import Order
        from apps.payments.models import Payment
        from django.db.models import Sum
        
        completed_orders = Order.objects.filter(
            driver=request.user,
            status__code='completed'
        ).count()
        
        total_earnings = Payment.objects.filter(
            user=request.user,
            payment_status='completed'
        ).aggregate(total=Sum('amount'))['total'] or 0
        
        return Response({
            'completed_orders': completed_orders,
            'total_earnings': float(total_earnings)
        }, status=status.HTTP_200_OK)


class UserUploadDocumentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request={'type': 'object', 'properties': {'document_photos': {'type': 'array', 'items': {'type': 'string', 'format': 'binary'}}}},
        responses={200: UserSerializer},
        summary="Upload user documents",
        description="Upload document photos for user verification"
    )
    def post(self, request):
        from django.core.files.storage import default_storage
        from django.conf import settings
        import os
        
        content_type = request.content_type or request.META.get('CONTENT_TYPE', '')
        
        if not request.FILES:
            if 'multipart/form-data' not in content_type:
                return Response({
                    'error': 'Content-Type must be multipart/form-data for file upload',
                    'received_content_type': content_type,
                    'hint': 'In Postman: select Body tab -> form-data (not raw) -> add key "document_photos" with type File (not Text)'
                }, status=status.HTTP_400_BAD_REQUEST)
            else:
                return Response({
                    'error': 'No files found in request',
                    'available_keys': list(request.POST.keys()) if request.POST else [],
                    'hint': 'Make sure key name is exactly "document_photos" and type is File (not Text)'
                }, status=status.HTTP_400_BAD_REQUEST)
        
        document_photos = request.FILES.getlist('document_photos')
        
        if not document_photos:
            available_files = list(request.FILES.keys())
            return Response({
                'error': 'No document_photos field found in request',
                'available_file_keys': available_files,
                'hint': f'Found files with keys: {available_files}. Use key name "document_photos" exactly.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        uploaded_files = []
        for photo in document_photos:
            try:
                file_path = f'documents/{request.user.id}/{photo.name}'
                saved_path = default_storage.save(file_path, photo)
                uploaded_files.append(saved_path)
            except Exception as e:
                return Response({'error': f'Error uploading file {photo.name}: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        
        current_documents = request.user.document_photos if isinstance(request.user.document_photos, list) else []
        request.user.document_photos = current_documents + uploaded_files
        request.user.save()
        
        serializer = UserSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)
