from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from drf_spectacular.utils import extend_schema
from django.db import transaction
from apps.common.exceptions import (
    ValidationError,
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    ExternalServiceError,
)
from .models import User, DriverDocument
from .serializers import (
    UserSerializer,
    UserRegisterSerializer,
    UserProfileUpdateSerializer,
    FCMTokenSerializer,
    DriverDocumentSerializer,
)
from .permissions import IsDriver, IsDispatcherOrUpdater


class RegisterThrottle(AnonRateThrottle):
    """Throttle for registration endpoint."""
    rate = '3/hour'


class LoginThrottle(AnonRateThrottle):
    """Throttle for login endpoint."""
    rate = '5/minute'


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    @extend_schema(request=UserRegisterSerializer, responses={201: UserSerializer})
    def post(self, request):
        try:
            serializer = UserRegisterSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    user = serializer.save()
                    refresh = RefreshToken.for_user(user)
                    return Response({
                        'user': UserSerializer(user).data,
                        'refresh': str(refresh),
                        'access': str(refresh.access_token),
                    }, status=status.HTTP_201_CREATED)
            raise ValidationError(detail=serializer.errors)
        except ValidationError:
            raise
        except Exception as e:
            raise ValidationError(detail=f'Ro\'yxatdan o\'tishda xatolik: {str(e)}')


class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [LoginThrottle]

    @extend_schema(responses={200: UserSerializer})
    def post(self, request):
        try:
            phone = request.data.get('phone')
            password = request.data.get('password')
            
            if not phone or not password:
                raise ValidationError(detail='Telefon raqam va parol kiritilishi shart')
            
            user = authenticate(request, username=phone, password=password)
            
            if user is None:
                raise AuthenticationError(detail='Noto\'g\'ri telefon raqam yoki parol')
            
            if user.is_blocked:
                raise PermissionDeniedError(detail='Foydalanuvchi bloklangan')
            
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user).data,
                'refresh': str(refresh),
                'access': str(refresh.access_token),
            }, status=status.HTTP_200_OK)
        except (ValidationError, AuthenticationError, PermissionDeniedError):
            raise
        except Exception as e:
            raise AuthenticationError(detail=f'Kirishda xatolik: {str(e)}')


class RefreshTokenView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(
        request={'type': 'object', 'properties': {'refresh': {'type': 'string'}}},
        responses={200: {'type': 'object', 'properties': {'access': {'type': 'string'}}}, 400: {'type': 'object', 'properties': {'error': {'type': 'string'}}}, 401: {'type': 'object', 'properties': {'error': {'type': 'string'}}}},
        summary="Refresh access token",
        description="Get new access token using refresh token"
    )
    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            if not refresh_token:
                raise ValidationError(detail='Refresh token kiritilishi shart')
            
            refresh = RefreshToken(refresh_token)
            return Response({
                'access': str(refresh.access_token),
            }, status=status.HTTP_200_OK)
        except ValidationError:
            raise
        except Exception as e:
            raise AuthenticationError(detail='Noto\'g\'ri yoki muddati o\'tgan refresh token')


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


class UpdateFCMTokenView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=FCMTokenSerializer,
        responses={200: {'type': 'object', 'properties': {'success': {'type': 'boolean'}, 'message': {'type': 'string'}}}},
        summary="Update FCM token",
        description="Update Firebase Cloud Messaging token for push notifications"
    )
    def post(self, request):
        serializer = FCMTokenSerializer(data=request.data)
        if serializer.is_valid():
            request.user.fcm_token = serializer.validated_data['fcm_token']
            request.user.save()
            return Response({
                'success': True,
                'message': 'FCM token updated successfully'
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DriverDocumentListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(
        request=DriverDocumentSerializer,
        responses={200: DriverDocumentSerializer(many=True), 201: DriverDocumentSerializer}
    )
    def get(self, request):
        docs = DriverDocument.objects.filter(user=request.user).select_related('vehicle').order_by('expires_at')
        serializer = DriverDocumentSerializer(docs, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = DriverDocumentSerializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        document = serializer.save(user=request.user)
        return Response(
            DriverDocumentSerializer(document, context={'request': request}).data,
            status=status.HTTP_201_CREATED
        )


class DriverDocumentDetailView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(request=DriverDocumentSerializer, responses={200: DriverDocumentSerializer})
    def put(self, request, pk):
        try:
            document = DriverDocument.objects.get(pk=pk, user=request.user)
        except DriverDocument.DoesNotExist:
            raise NotFoundError(detail='Driver document topilmadi')
        serializer = DriverDocumentSerializer(document, data=request.data, partial=True, context={'request': request})
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(responses={204: None})
    def delete(self, request, pk):
        try:
            document = DriverDocument.objects.get(pk=pk, user=request.user)
        except DriverDocument.DoesNotExist:
            raise NotFoundError(detail='Driver document topilmadi')
        document.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class DriverDocumentMonitoringView(APIView):
    permission_classes = [IsAuthenticated, IsDispatcherOrUpdater]

    @extend_schema(
        parameters=[
            {'name': 'days', 'in': 'query', 'required': False, 'schema': {'type': 'integer'}},
            {'name': 'severity', 'in': 'query', 'required': False, 'schema': {'type': 'string', 'enum': ['expired', 'soon', 'all']}},
            {'name': 'document_type', 'in': 'query', 'required': False, 'schema': {'type': 'string'}},
        ],
        responses={200: {'type': 'object'}}
    )
    def get(self, request):
        from django.utils import timezone
        from datetime import timedelta

        days = int(request.query_params.get('days', 30))
        severity = request.query_params.get('severity', 'all')
        document_type = request.query_params.get('document_type')
        today = timezone.now().date()
        warning_date = today + timedelta(days=max(days, 1))

        queryset = DriverDocument.objects.select_related('user', 'vehicle').filter(
            is_active=True,
            user__is_driver=True,
            expires_at__lte=warning_date,
        )
        if document_type:
            queryset = queryset.filter(document_type=document_type)

        items = []
        for doc in queryset.order_by('expires_at')[:500]:
            days_left = (doc.expires_at - today).days
            status_label = 'expired' if days_left < 0 else 'soon'
            if severity != 'all' and status_label != severity:
                continue
            items.append({
                'id': doc.id,
                'driver_id': doc.user_id,
                'driver_name': f"{doc.user.first_name} {doc.user.last_name}".strip(),
                'driver_phone': doc.user.phone,
                'document_type': doc.document_type,
                'document_type_name': doc.get_document_type_display(),
                'document_number': doc.document_number,
                'expires_at': doc.expires_at.isoformat(),
                'days_left': days_left,
                'status': status_label,
                'vehicle_number': doc.vehicle.number if doc.vehicle else None,
            })

        return Response({
            'count': len(items),
            'expired_count': len([x for x in items if x['status'] == 'expired']),
            'soon_count': len([x for x in items if x['status'] == 'soon']),
            'items': items,
        }, status=status.HTTP_200_OK)
