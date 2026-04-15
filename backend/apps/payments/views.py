from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.core.cache import cache
from django.utils import timezone
from django.conf import settings
from django.db import transaction
from .models import Payment, PaymentHistory
from apps.orders.models import Order
from apps.common.pagination import StandardResultsSetPagination
from apps.common.cache_utils import build_user_cache_key, bump_cache_version, get_cache_version
from apps.common.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionDeniedError,
    PaymentError,
    ExternalServiceError,
    DatabaseError,
)
from .serializers import PaymentSerializer, PaymentCreateSerializer, PaymentHistorySerializer, PaymentRefundSerializer
from .services import ClickPaymentService, PaymePaymentService, UzumPaymentService, PaymentSecurityService
from apps.notifications.services import create_notification
from apps.users.permissions import can_access_order, can_access_payment

PAYMENTS_MY_CACHE_SCOPE = 'payments_my_list'
PAYMENTS_LIST_CACHE_TTL = 60


def _invalidate_payment_list_caches(payment: Payment):
    bump_cache_version(PAYMENTS_MY_CACHE_SCOPE, 'global')
    user_ids = {payment.user_id}
    if payment.order_id:
        if payment.order and payment.order.client_id:
            user_ids.add(payment.order.client_id)
        if payment.order and payment.order.driver_id:
            user_ids.add(payment.order.driver_id)

    for user_id in user_ids:
        if user_id:
            bump_cache_version(PAYMENTS_MY_CACHE_SCOPE, user_id)


class PaymentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PaymentCreateSerializer, responses={201: PaymentSerializer})
    def post(self, request):
        try:
            serializer = PaymentCreateSerializer(data=request.data)
            if not serializer.is_valid():
                raise ValidationError(detail=serializer.errors)
            
            amount = serializer.validated_data['amount']
            payment_method = serializer.validated_data['payment_method']
            order_id = serializer.validated_data.get('order_id')
            
            # Validate order if provided
            if order_id:
                try:
                    order = Order.objects.get(pk=order_id)
                    if not can_access_order(request.user, order):
                        raise PermissionDeniedError(detail='Bu buyurtmaga to\'lov qilish huquqingiz yo\'q')
                except Order.DoesNotExist:
                    raise NotFoundError(detail='Buyurtma topilmadi')
            
            # Create payment within transaction
            with transaction.atomic():
                payment = Payment.objects.create(
                    user=request.user,
                    amount=amount,
                    payment_method=payment_method,
                    order_id=order_id if order_id else None
                )
                
                # Call payment gateway
                result = None
                try:
                    if payment_method == 'click':
                        result = ClickPaymentService.create_payment(amount, payment.id)
                    elif payment_method == 'payme':
                        result = PaymePaymentService.create_payment(amount, payment.id)
                    elif payment_method == 'uzum':
                        result = UzumPaymentService.create_payment(amount, payment.id)
                    else:
                        raise PaymentError(detail='Noto\'g\'ri to\'lov usuli')
                except Exception as e:
                    raise ExternalServiceError(detail=f'To\'lov gateway\'da xatolik: {str(e)}')
                
                if result:
                    payment.gateway_response = result
                    payment.transaction_id = result.get('transaction_id') or result.get('id') or str(payment.id)
                    payment.save()
                    
                    PaymentHistory.objects.create(
                        payment=payment,
                        status='pending',
                        status_new='processing',
                        gateway_response=result
                    )

            payment = Payment.objects.select_related('order').get(pk=payment.pk)
            _invalidate_payment_list_caches(payment)
            
            return Response(PaymentSerializer(payment, context={'request': request, 'include_history': True}).data, status=status.HTTP_201_CREATED)
        except (ValidationError, NotFoundError, PermissionDeniedError, PaymentError, ExternalServiceError):
            raise
        except Exception as e:
            raise DatabaseError(detail=f'To\'lov yaratishda xatolik: {str(e)}')


class PaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer})
    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related('order', 'user').prefetch_related('history').get(pk=pk)
            if not can_access_payment(request.user, payment):
                raise PermissionDeniedError(detail='Bu to\'lovga kirish huquqingiz yo\'q')
            serializer = PaymentSerializer(payment, context={'request': request, 'include_history': True})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')


class PaymentCallbackView(APIView):
    permission_classes = []

    def _verify_click_callback(self, request, payment, callback_data):
        client_ip = PaymentSecurityService.get_client_ip(request)
        if settings.CLICK_ALLOWED_IPS and not PaymentSecurityService.check_ip_whitelist(client_ip, settings.CLICK_ALLOWED_IPS):
            return False, 'IP address not allowed'
        
        merchant_trans_id = callback_data.get('merchant_trans_id', '')
        service_id = callback_data.get('service_id', '')
        amount = callback_data.get('amount', '')
        action = callback_data.get('action', '')
        sign_time = callback_data.get('sign_time', '')
        click_trans_id = callback_data.get('click_trans_id', '')
        sign_string = callback_data.get('sign_string', '')
        
        if not ClickPaymentService.verify_signature(
            merchant_trans_id, service_id, amount, action, sign_time, click_trans_id, sign_string
        ):
            return False, 'Invalid signature'
        
        if str(payment.id) != merchant_trans_id:
            return False, 'Payment ID mismatch'
        
        if float(amount) != float(payment.amount):
            return False, 'Amount mismatch'
        
        return True, None

    def _verify_payme_callback(self, request, payment, callback_data):
        client_ip = PaymentSecurityService.get_client_ip(request)
        if settings.PAYME_ALLOWED_IPS and not PaymentSecurityService.check_ip_whitelist(client_ip, settings.PAYME_ALLOWED_IPS):
            return False, 'IP address not allowed'
        
        if not PaymePaymentService.verify_signature(callback_data):
            return False, 'Invalid signature'
        
        params = callback_data.get('params', {})
        account = params.get('account', {})
        order_id = account.get('order_id', '')
        
        if str(payment.id) != str(order_id):
            return False, 'Payment ID mismatch'
        
        amount = params.get('amount', 0) / 100
        if abs(float(amount) - float(payment.amount)) > 0.01:
            return False, 'Amount mismatch'
        
        return True, None

    def _verify_uzum_callback(self, request, payment, callback_data):
        client_ip = PaymentSecurityService.get_client_ip(request)
        if settings.UZUM_ALLOWED_IPS and not PaymentSecurityService.check_ip_whitelist(client_ip, settings.UZUM_ALLOWED_IPS):
            return False, 'IP address not allowed'
        
        callback_data_copy = callback_data.copy()
        if not UzumPaymentService.verify_signature(callback_data_copy):
            return False, 'Invalid signature'
        
        order_id = callback_data.get('order_id', '')
        if str(payment.id) != str(order_id):
            return False, 'Payment ID mismatch'
        
        amount = callback_data.get('amount', 0)
        if abs(float(amount) - float(payment.amount)) > 0.01:
            return False, 'Amount mismatch'
        
        return True, None

    def post(self, request, pk):
        try:
            payment = Payment.objects.get(pk=pk)
            old_status = payment.payment_status
            
            payment_method = payment.payment_method
            callback_data = request.data.copy()
            
            verification_passed = False
            error_message = None
            
            # Verify callback based on payment method
            if payment_method == 'click':
                verification_passed, error_message = self._verify_click_callback(request, payment, callback_data)
                if verification_passed:
                    action = callback_data.get('action')
                    error_code = callback_data.get('error')
                    if action == 0 and error_code == 0:
                        payment.payment_status = 'completed'
                        payment.paid_at = timezone.now()
                    elif error_code != 0:
                        payment.payment_status = 'failed'
            elif payment_method == 'payme':
                verification_passed, error_message = self._verify_payme_callback(request, payment, callback_data)
                if verification_passed:
                    result = callback_data.get('result', {})
                    state = result.get('state')
                    if state == 2:
                        payment.payment_status = 'completed'
                        payment.paid_at = timezone.now()
                    elif state == -1 or state == -2:
                        payment.payment_status = 'failed'
            elif payment_method == 'uzum':
                verification_passed, error_message = self._verify_uzum_callback(request, payment, callback_data)
                if verification_passed:
                    callback_status = callback_data.get('status')
                    if callback_status == 'success':
                        payment.payment_status = 'completed'
                        payment.paid_at = timezone.now()
                    elif callback_status == 'failed' or callback_status == 'error':
                        payment.payment_status = 'failed'
            else:
                raise PaymentError(detail='Noto\'g\'ri to\'lov usuli')
            
            # Handle verification failure
            if not verification_passed:
                with transaction.atomic():
                    PaymentHistory.objects.create(
                        payment=payment,
                        status=old_status,
                        status_new='failed',
                        gateway_response={'error': error_message, 'callback_data': callback_data}
                    )
                raise PaymentError(detail=error_message or 'Callback tasdiqlash muvaffaqiyatsiz')
            
            # Update payment status if changed
            if payment.payment_status != old_status:
                with transaction.atomic():
                    payment.gateway_response = callback_data
                    payment.save()
                    
                    PaymentHistory.objects.create(
                        payment=payment,
                        status=old_status,
                        status_new=payment.payment_status,
                        gateway_response=callback_data
                    )
                
                # Send notifications (don't fail if notification fails)
                if payment.payment_status == 'completed':
                    try:
                        create_notification(
                            user=payment.user,
                            notification_type='payment_received',
                            title='To\'lov qabul qilindi',
                            message=f"To'lov #{payment.id} muvaffaqiyatli qabul qilindi. Summa: {payment.amount} so'm.",
                            order=payment.order
                        )
                        
                        # Order owner'ga ham notification (agar order bo'lsa)
                        if payment.order:
                            if payment.order.client != payment.user:
                                create_notification(
                                    user=payment.order.client,
                                    notification_type='payment_received',
                                    title='To\'lov qabul qilindi',
                                    message=f"Buyurtma #{payment.order.id} uchun to'lov qabul qilindi. Summa: {payment.amount} so'm.",
                                    order=payment.order
                                )
                            if payment.order.driver and payment.order.driver != payment.user:
                                create_notification(
                                    user=payment.order.driver,
                                    notification_type='payment_received',
                                    title='To\'lov qabul qilindi',
                                    message=f"Buyurtma #{payment.order.id} uchun to'lov qabul qilindi. Summa: {payment.amount} so'm.",
                                    order=payment.order
                                )
                    except Exception as e:
                        # Log notification error but don't fail the request
                        import logging
                        logger = logging.getLogger(__name__)
                        logger.warning(f'Notification error in payment callback: {str(e)}')
                payment = Payment.objects.select_related('order').get(pk=payment.pk)
                _invalidate_payment_list_caches(payment)
            
            return Response({'status': 'success', 'payment_status': payment.payment_status}, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')
        except (PaymentError, ExternalServiceError):
            raise
        except Exception as e:
            raise DatabaseError(detail=f'Callback qayta ishlashda xatolik: {str(e)}')


class MyPaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer(many=True)})
    def get(self, request):
        page = request.query_params.get('page', '1')
        page_size = request.query_params.get('page_size', '20')
        status_filter = request.query_params.get('status')

        cache_key = build_user_cache_key(
            PAYMENTS_MY_CACHE_SCOPE,
            request.user.id,
            {
                'global_version': get_cache_version(PAYMENTS_MY_CACHE_SCOPE, 'global'),
                'page': page,
                'page_size': page_size,
                'status': status_filter or '',
            },
        )
        cached_payload = cache.get(cache_key)
        if cached_payload is not None:
            return Response(cached_payload, status=status.HTTP_200_OK)

        payments = Payment.objects.filter(user=request.user).select_related('order').order_by('-created_at')
        if status_filter:
            payments = payments.filter(payment_status=status_filter)

        paginator = StandardResultsSetPagination()
        page_queryset = paginator.paginate_queryset(payments, request)
        serializer = PaymentSerializer(page_queryset, many=True, context={'request': request, 'include_history': False})
        payload = paginator.get_paginated_response(serializer.data).data
        cache.set(cache_key, payload, PAYMENTS_LIST_CACHE_TTL)
        return Response(payload, status=status.HTTP_200_OK)


class OrderPaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer(many=True)})
    def get(self, request, order_id):
        try:
            order = Order.objects.select_related('client', 'driver').get(pk=order_id)
            if not can_access_order(request.user, order):
                raise PermissionDeniedError(detail='Bu buyurtmaga kirish huquqingiz yo\'q')
            payments = Payment.objects.filter(order=order).select_related('order').order_by('-created_at')
            serializer = PaymentSerializer(payments, many=True, context={'request': request, 'include_history': False})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            raise NotFoundError(detail='Buyurtma topilmadi')


class PaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentHistorySerializer(many=True)})
    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related('order', 'user').get(pk=pk)
            if not can_access_payment(request.user, payment):
                raise PermissionDeniedError(detail='Bu to\'lov tarixiga kirish huquqingiz yo\'q')
            history = PaymentHistory.objects.filter(payment=payment).order_by('-created_at')
            serializer = PaymentHistorySerializer(history, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')


class PaymentRefundView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PaymentRefundSerializer, responses={200: PaymentSerializer})
    def post(self, request, pk):
        try:
            payment = Payment.objects.select_related('order', 'user').get(pk=pk)
            if not can_access_payment(request.user, payment):
                raise PermissionDeniedError(detail='Bu to\'lovni qaytarish huquqingiz yo\'q')
            
            if payment.payment_status != 'completed':
                raise PaymentError(detail='Faqat yakunlangan to\'lovlar qaytarilishi mumkin')
            
            if payment.is_refunded:
                raise PaymentError(detail='To\'lov allaqachon qaytarilgan')
            
            serializer = PaymentRefundSerializer(data=request.data)
            if not serializer.is_valid():
                raise ValidationError(detail=serializer.errors)
            
            reason = serializer.validated_data.get('reason', '')
            payment_method = payment.payment_method
            
            # Process refund through gateway
            refund_result = None
            try:
                if payment_method == 'click':
                    refund_result = ClickPaymentService.refund_payment(payment.transaction_id, payment.amount)
                elif payment_method == 'payme':
                    refund_result = PaymePaymentService.refund_payment(payment.transaction_id, payment.amount)
                elif payment_method == 'uzum':
                    refund_result = UzumPaymentService.refund_payment(payment.transaction_id, payment.amount)
                else:
                    raise PaymentError(detail='Noto\'g\'ri to\'lov usuli')
            except Exception as e:
                raise ExternalServiceError(detail=f'To\'lovni qaytarishda xatolik: {str(e)}')
            
            if not refund_result or not refund_result.get('success'):
                raise PaymentError(detail=refund_result.get('error', 'To\'lovni qaytarish muvaffaqiyatsiz'))
            
            # Update payment within transaction
            with transaction.atomic():
                payment.refunded_at = timezone.now()
                payment.refund_amount = payment.amount
                payment.refund_reason = reason
                payment.payment_status = 'cancelled'
                payment.save()
                
                PaymentHistory.objects.create(
                    payment=payment,
                    status='completed',
                    status_new='cancelled',
                    gateway_response={'refund': refund_result, 'reason': reason}
                )
            payment = Payment.objects.select_related('order').get(pk=payment.pk)
            _invalidate_payment_list_caches(payment)
            
            return Response(PaymentSerializer(payment, context={'request': request, 'include_history': True}).data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')
        except (ValidationError, PaymentError, ExternalServiceError, PermissionDeniedError):
            raise
        except Exception as e:
            raise DatabaseError(detail=f'To\'lovni qaytarishda xatolik: {str(e)}')
