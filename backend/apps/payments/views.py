from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.core.cache import cache
from django.utils import timezone
from django.conf import settings
from django.db import transaction
import uuid
from decimal import Decimal
from .models import OrderCompletionFee, Payment, PaymentHistory
from apps.orders.models import Order
from apps.common.pagination import StandardResultsSetPagination
from apps.common.openapi import EmptySerializer
from apps.common.cache_utils import build_user_cache_key, bump_cache_version, get_cache_version
from apps.common.exceptions import (
    ValidationError,
    NotFoundError,
    PermissionDeniedError,
    PaymentError,
    ExternalServiceError,
    DatabaseError,
)
from .serializers import (
    OrderCompletionFeePaySerializer,
    OrderCompletionFeeSerializer,
    PaymentSerializer,
    PaymentCreateSerializer,
    PaymentHistorySerializer,
    PaymentRefundSerializer,
)
from .services import ClickPaymentService, PaymePaymentService, UzumPaymentService, PaymentSecurityService
from .gateway_init import initiate_gateway_payment
from .order_payment import (
    lock_order_for_payment,
    mark_payment_completed,
    order_platform_payments_enabled,
    validate_order_payment_request,
    finalize_completed_payment,
    sync_order_payment_confirmation,
)
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


class WalletView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        from apps.payments.ledger import wallet_payload
        from apps.orders.financial import driver_earnings_payload

        payload = wallet_payload(request.user)
        if request.user.is_driver:
            payload.update(driver_earnings_payload(request.user))
            payload['available'] = payload.get('available_balance', payload['available'])
        return Response(payload, status=status.HTTP_200_OK)


class OrderCompletionFeeListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        from .completion_fees import completion_fee_summary

        fee_status = request.query_params.get('status', OrderCompletionFee.STATUS_PENDING)
        queryset = OrderCompletionFee.objects.filter(user=request.user).select_related(
            'order', 'paid_payment'
        )
        if fee_status in dict(OrderCompletionFee.STATUS_CHOICES):
            queryset = queryset.filter(status=fee_status)
        elif fee_status != 'all':
            raise ValidationError(detail={'status': 'Noto\'g\'ri xizmat to\'lovi holati'})

        return Response(
            {
                'summary': completion_fee_summary(request.user),
                'results': OrderCompletionFeeSerializer(queryset, many=True).data,
            },
            status=status.HTTP_200_OK,
        )


class OrderCompletionFeeSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        from .completion_fees import completion_fee_summary

        return Response(completion_fee_summary(request.user), status=status.HTTP_200_OK)


class OrderCompletionFeePayView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=OrderCompletionFeePaySerializer, responses={200: PaymentSerializer, 201: PaymentSerializer})
    def post(self, request, pk):
        serializer = OrderCompletionFeePaySerializer(data=request.data)
        if not serializer.is_valid():
            raise ValidationError(detail=serializer.errors)
        payment_method = serializer.validated_data['payment_method']

        with transaction.atomic():
            try:
                fee = OrderCompletionFee.objects.select_for_update().select_related('order').get(
                    pk=pk,
                    user=request.user,
                )
            except OrderCompletionFee.DoesNotExist:
                raise NotFoundError(detail='Xizmat to\'lovi topilmadi')

            if fee.status == OrderCompletionFee.STATUS_WAIVED:
                raise ValidationError(detail='Bu xizmat to\'lovi administrator tomonidan bekor qilingan')
            if fee.status == OrderCompletionFee.STATUS_PAID:
                payment = fee.paid_payment or fee.payments.filter(payment_status='completed').order_by('-paid_at', '-id').first()
                if not payment:
                    raise PaymentError(detail='Xizmat to\'lovi allaqachon to\'langan')
                return Response(
                    PaymentSerializer(payment, context={'request': request, 'include_history': True}).data,
                    status=status.HTTP_200_OK,
                )

            payment = fee.payments.filter(
                payment_status__in=['pending', 'processing'],
            ).order_by('-created_at').first()
            created = False
            if payment is None:
                payment = Payment.objects.create(
                    user=request.user,
                    order=fee.order,
                    completion_fee=fee,
                    amount=fee.amount,
                    currency=fee.currency,
                    payment_method=payment_method,
                    gateway_response={
                        'purpose': 'order_completion_fee',
                        'completion_fee_id': fee.id,
                        'order_id': fee.order_id,
                        'role': fee.role,
                    },
                )
                created = True

                if payment_method == 'mock':
                    if not getattr(settings, 'PAYMENTS_ALLOW_MOCK', False):
                        raise PermissionDeniedError(detail='Mock to\'lov usuli o\'chirilgan')
                    payment.transaction_id = f'mock-fee-{payment.pk}-{uuid.uuid4().hex[:10]}'
                    payment.save(update_fields=['transaction_id', 'updated_at'])
                    gateway_response = {
                        **payment.gateway_response,
                        'mock': True,
                    }
                    mark_payment_completed(payment, gateway_response=gateway_response)
                    PaymentHistory.objects.create(
                        payment=payment,
                        status='pending',
                        status_new='completed',
                        gateway_response=gateway_response,
                    )
                else:
                    initiate_gateway_payment(payment)

        payment = Payment.objects.select_related('order', 'completion_fee').prefetch_related('history').get(pk=payment.pk)
        _invalidate_payment_list_caches(payment)
        return Response(
            PaymentSerializer(payment, context={'request': request, 'include_history': True}).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


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

            if order_id and not order_platform_payments_enabled():
                raise PermissionDeniedError(
                    detail='Buyurtma to\'lovi platforma orqali o\'tmaydi. Shafyor va mijoz o\'zlari kelishadi.'
                )
            
            with transaction.atomic():
                order = None
                if order_id:
                    try:
                        order = lock_order_for_payment(order_id)
                    except Order.DoesNotExist:
                        raise NotFoundError(detail='Buyurtma topilmadi')
                    validate_order_payment_request(order, user_id=request.user.id, amount=amount)
                
                payment = Payment.objects.create(
                    user=request.user,
                    amount=amount,
                    payment_method=payment_method,
                    order_id=order_id if order_id else None,
                )

                if payment_method == 'mock':
                    if not getattr(settings, 'PAYMENTS_ALLOW_MOCK', False):
                        raise PermissionDeniedError(detail='Mock to\'lov usuli o\'chirilgan')
                    payment.transaction_id = f'mock-{payment.pk}-{uuid.uuid4().hex[:10]}'
                    payment.save(update_fields=['transaction_id', 'updated_at'])
                    mark_payment_completed(payment, gateway_response={'mock': True})
                    PaymentHistory.objects.create(
                        payment=payment,
                        status='pending',
                        status_new='completed',
                        gateway_response={'mock': True},
                    )
                else:
                    try:
                        initiate_gateway_payment(payment, order_id=order_id)
                    except Exception:
                        raise

            payment = Payment.objects.select_related('order', 'completion_fee').get(pk=payment.pk)
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
            payment = Payment.objects.select_related('order', 'user', 'completion_fee').prefetch_related('history').get(pk=pk)
            if not can_access_payment(request.user, payment):
                raise PermissionDeniedError(detail='Bu to\'lovga kirish huquqingiz yo\'q')
            serializer = PaymentSerializer(payment, context={'request': request, 'include_history': True})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')


class PaymentCallbackView(APIView):
    serializer_class = EmptySerializer
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
            with transaction.atomic():
                payment = Payment.objects.select_for_update(of=('self',)).get(pk=pk)
                old_status = payment.payment_status

                payment_method = payment.payment_method
                callback_data = request.data.copy()

                verification_passed = False
                error_message = None

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

                if not verification_passed:
                    PaymentHistory.objects.create(
                        payment=payment,
                        status=old_status,
                        status_new='failed',
                        gateway_response={'error': error_message, 'callback_data': callback_data},
                    )
                    raise PaymentError(detail=error_message or 'Callback tasdiqlash muvaffaqiyatsiz')

                if old_status == 'completed' and payment.payment_status == 'completed':
                    return Response(
                        {'status': 'success', 'payment_status': payment.payment_status},
                        status=status.HTTP_200_OK,
                    )

                if payment.payment_status != old_status:
                    existing = payment.gateway_response if isinstance(payment.gateway_response, dict) else {}
                    payment.gateway_response = {**existing, **callback_data}
                    payment.save()

                    PaymentHistory.objects.create(
                        payment=payment,
                        status=old_status,
                        status_new=payment.payment_status,
                        gateway_response=payment.gateway_response,
                    )

                    if payment.payment_status == 'completed':
                        if payment.order_id:
                            lock_order_for_payment(payment.order_id)
                        finalize_completed_payment(payment)

            payment = Payment.objects.select_related('order').get(pk=pk)
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

        payments = Payment.objects.filter(user=request.user).select_related('order', 'completion_fee').order_by('-created_at')
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
            payments = Payment.objects.filter(
                order=order,
                completion_fee__isnull=True,
            ).select_related('order').order_by('-created_at')
            serializer = PaymentSerializer(payments, many=True, context={'request': request, 'include_history': False})
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            raise NotFoundError(detail='Buyurtma topilmadi')


class PaymentHistoryView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentHistorySerializer(many=True)})
    def get(self, request, pk):
        try:
            payment = Payment.objects.select_related('order', 'user', 'completion_fee').get(pk=pk)
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
            payment = Payment.objects.select_related('order', 'user', 'completion_fee').get(pk=pk)
            from apps.users.permissions import _has_admin_like_role
            if not _has_admin_like_role(request.user) and payment.user_id != request.user.id:
                raise PermissionDeniedError(detail='Faqat to\'lov qilgan mijoz to\'lovni qaytara oladi')

            if payment.completion_fee_id:
                raise PermissionDeniedError(
                    detail='Hisobni qayta bloklamaslik uchun xizmat to\'lovlari avtomatik qaytarilmaydi. Administratorga murojaat qiling.'
                )
            
            if payment.payment_status != 'completed':
                raise PaymentError(detail='Faqat yakunlangan to\'lovlar qaytarilishi mumkin')
            
            if payment.is_refunded:
                raise PaymentError(detail='To\'lov allaqachon to\'liq qaytarilgan')
            
            serializer = PaymentRefundSerializer(data=request.data)
            if not serializer.is_valid():
                raise ValidationError(detail=serializer.errors)
            
            reason = serializer.validated_data.get('reason', '')
            requested_amount = serializer.validated_data.get('amount')
            refundable = payment.refundable_amount
            if refundable <= 0:
                raise PaymentError(detail='Qaytariladigan summa qolmagan')
            if requested_amount is None:
                refund_amount = refundable
            else:
                refund_amount = requested_amount
                if refund_amount <= 0:
                    raise ValidationError(detail='Qaytarish summasi musbat bo\'lishi kerak')
                if refund_amount > refundable:
                    raise ValidationError(detail=f'Qaytarish summasi qoldiqdan oshmasligi kerak ({refundable} so\'m)')
            payment_method = payment.payment_method
            
            # Process refund through gateway
            refund_result = None
            try:
                if payment_method == 'mock':
                    if not getattr(settings, 'PAYMENTS_ALLOW_MOCK', False):
                        raise PaymentError(detail='Mock to\'lov usuli o\'chirilgan')
                    refund_result = {'success': True, 'mock': True}
                elif payment_method == 'click':
                    refund_result = ClickPaymentService.refund_payment(payment.transaction_id, refund_amount)
                elif payment_method == 'payme':
                    refund_result = PaymePaymentService.refund_payment(payment.transaction_id, refund_amount)
                elif payment_method == 'uzum':
                    refund_result = UzumPaymentService.refund_payment(payment.transaction_id, refund_amount)
                else:
                    raise PaymentError(detail='Noto\'g\'ri to\'lov usuli')
            except Exception as e:
                raise ExternalServiceError(detail=f'To\'lovni qaytarishda xatolik: {str(e)}')
            
            if not refund_result or not refund_result.get('success'):
                raise PaymentError(detail=refund_result.get('error', 'To\'lovni qaytarish muvaffaqiyatsiz'))
            
            # Update payment within transaction
            with transaction.atomic():
                payment = Payment.objects.select_for_update(of=('self',)).get(pk=pk)
                if payment.is_refunded:
                    raise PaymentError(detail='To\'lov allaqachon to\'liq qaytarilgan')
                previous_refund = payment.refund_amount or Decimal('0')
                new_refund_total = previous_refund + refund_amount
                if new_refund_total > payment.amount:
                    raise PaymentError(detail='Qaytarish summasi to\'lov summasidan oshib ketdi')

                payment.refunded_at = payment.refunded_at or timezone.now()
                payment.refund_amount = new_refund_total
                payment.refund_reason = reason
                if new_refund_total >= payment.amount:
                    payment.payment_status = 'cancelled'
                payment.save()

                status_new = 'cancelled' if new_refund_total >= payment.amount else 'completed'
                PaymentHistory.objects.create(
                    payment=payment,
                    status='completed',
                    status_new=status_new,
                    gateway_response={
                        'refund': refund_result,
                        'reason': reason,
                        'refund_amount': str(refund_amount),
                        'refund_total': str(new_refund_total),
                    },
                )
                if payment.order_id and order_platform_payments_enabled():
                    lock_order_for_payment(payment.order_id)
                    payment.order.refresh_from_db()
                    sync_order_payment_confirmation(payment.order)
                    from apps.orders.realtime import broadcast_order_payment_updated
                    broadcast_order_payment_updated(payment.order)
            payment = Payment.objects.select_related('order').get(pk=payment.pk)
            _invalidate_payment_list_caches(payment)
            
            return Response(PaymentSerializer(payment, context={'request': request, 'include_history': True}).data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            raise NotFoundError(detail='To\'lov topilmadi')
        except (ValidationError, PaymentError, ExternalServiceError, PermissionDeniedError):
            raise
        except Exception as e:
            raise DatabaseError(detail=f'To\'lovni qaytarishda xatolik: {str(e)}')
