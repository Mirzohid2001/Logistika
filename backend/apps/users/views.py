from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import UserRateThrottle, AnonRateThrottle
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import authenticate
from django.conf import settings
from drf_spectacular.utils import extend_schema
from django.db import transaction
import logging
import uuid
from apps.common.exceptions import (
    ValidationError,
    AuthenticationError,
    PermissionDeniedError,
    NotFoundError,
    ExternalServiceError,
)
from apps.common.openapi import EmptySerializer
from .models import User, DriverDocument
from .serializers import (
    UserSerializer,
    UserRegisterSerializer,
    UserProfileUpdateSerializer,
    FCMTokenSerializer,
    DriverDocumentSerializer,
    LoginRequestSerializer,
    RefreshTokenRequestSerializer,
    UserDocumentUploadSerializer,
)
from .phone import normalize_phone, phone_lookup_variants
from .permissions import IsDriver, IsDispatcherOrUpdater

logger = logging.getLogger(__name__)


class RegisterThrottle(AnonRateThrottle):
    """Throttle for registration endpoint."""
    scope = 'register'


class LoginThrottle(AnonRateThrottle):
    """Throttle for login endpoint."""
    scope = 'login'


class RegisterView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [RegisterThrottle]

    @extend_schema(request=UserRegisterSerializer, responses={201: UserSerializer})
    def post(self, request):
        if getattr(settings, 'TELEGRAM_ONLY_REGISTRATION', True):
            return Response(
                {
                    'error': 'Yangi akkaunt faqat Telegram orqali yaratiladi',
                    'code': 'telegram_registration_required',
                },
                status=status.HTTP_410_GONE,
            )
        try:
            serializer = UserRegisterSerializer(data=request.data)
            if serializer.is_valid():
                with transaction.atomic():
                    user = serializer.save()
                    refresh = RefreshToken.for_user(user)
                    return Response({
                        'user': UserSerializer(user, context={'request': request}).data,
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
    serializer_class = LoginRequestSerializer

    @extend_schema(request=LoginRequestSerializer, responses={200: UserSerializer})
    def post(self, request):
        try:
            phone_raw = request.data.get('phone')
            password = request.data.get('password')
            
            if not phone_raw or not password:
                raise ValidationError(detail='Telefon raqam va parol kiritilishi shart')

            user = None
            for variant in phone_lookup_variants(phone_raw):
                user = authenticate(request, username=variant, password=password)
                if user is not None:
                    break
            
            if user is None:
                raise AuthenticationError(detail='Noto\'g\'ri telefon raqam yoki parol')
            
            if user.is_blocked:
                raise PermissionDeniedError(detail='Foydalanuvchi bloklangan')

            device_id = (request.data.get('device_id') or '').strip() or None
            if device_id:
                from apps.subscriptions.trial import ensure_user_trial_initialized
                ensure_user_trial_initialized(user, device_id=device_id)
            
            refresh = RefreshToken.for_user(user)
            return Response({
                'user': UserSerializer(user, context={'request': request}).data,
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
        request=RefreshTokenRequestSerializer,
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
    throttle_classes = []

    @extend_schema(responses={200: UserSerializer})
    def get(self, request):
        serializer = UserSerializer(request.user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    @extend_schema(request=UserProfileUpdateSerializer, responses={200: UserSerializer})
    def put(self, request):
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            request.user.refresh_from_db()
            return Response(
                UserSerializer(request.user, context={'request': request}).data,
                status=status.HTTP_200_OK,
            )
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
        from apps.orders.financial import driver_earnings_payload

        return Response(driver_earnings_payload(request.user), status=status.HTTP_200_OK)


class UserUploadDocumentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(
        request=UserDocumentUploadSerializer,
        responses={200: UserSerializer},
        summary="Upload user documents",
        description="Upload document photos for user verification"
    )
    def post(self, request):
        from django.core.files.storage import default_storage
        from apps.common.file_validation import validate_verification_image

        if not request.user.is_driver:
            return Response(
                {'error': 'Hujjatlarni faqat haydovchi akkaunti yuklashi mumkin'},
                status=status.HTTP_403_FORBIDDEN,
            )
        
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

        if len(document_photos) > 5:
            return Response(
                {'error': 'Bir so\'rovda 5 tadan ortiq hujjat yuborib bo\'lmaydi'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_documents = request.user.document_photos if isinstance(request.user.document_photos, list) else []
        if len(current_documents) + len(document_photos) > 10:
            return Response(
                {'error': 'Akkaunt uchun eng ko\'pi 10 ta hujjat saqlash mumkin'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        validated_photos = []
        try:
            for photo in document_photos:
                validated_photos.append((photo, validate_verification_image(photo)))
        except ValueError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        
        uploaded_files = []
        try:
            for photo, extension in validated_photos:
                file_path = f'documents/{request.user.id}/{uuid.uuid4().hex}.{extension}'
                saved_path = default_storage.save(file_path, photo)
                uploaded_files.append(saved_path)
        except Exception:
            for saved_path in uploaded_files:
                default_storage.delete(saved_path)
            logger.exception('Verification document upload failed', extra={'event': 'document_upload_failed'})
            return Response({'error': 'Hujjatni saqlab bo\'lmadi'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
        request.user.document_photos = current_documents + uploaded_files
        if request.user.is_driver:
            from .verification import mark_driver_verification_pending
            mark_driver_verification_pending(
                request.user,
                save_fields=['document_photos', 'verification_status', 'is_verified', 'updated_at'],
            )
        else:
            request.user.save(update_fields=['document_photos', 'updated_at'])
        
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
            from apps.users.device_tokens import register_device_token

            register_device_token(
                request.user,
                serializer.validated_data['fcm_token'],
                device_id=serializer.validated_data.get('device_id') or '',
                platform=serializer.validated_data.get('platform') or '',
            )
            return Response({
                'success': True,
                'message': 'FCM token updated successfully'
            }, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class DriverDocumentListCreateView(APIView):
    serializer_class = DriverDocumentSerializer
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
        from .verification import mark_driver_verification_pending
        mark_driver_verification_pending(request.user)
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
        from .verification import mark_driver_verification_pending
        mark_driver_verification_pending(request.user)
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
