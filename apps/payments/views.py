from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
from django.utils import timezone
from django.conf import settings
from .models import Payment, PaymentHistory
from apps.orders.models import Order
from .serializers import PaymentSerializer, PaymentCreateSerializer, PaymentHistorySerializer
from .services import ClickPaymentService, PaymePaymentService, UzumPaymentService, PaymentSecurityService


class PaymentCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=PaymentCreateSerializer, responses={201: PaymentSerializer})
    def post(self, request):
        serializer = PaymentCreateSerializer(data=request.data)
        if serializer.is_valid():
            amount = serializer.validated_data['amount']
            payment_method = serializer.validated_data['payment_method']
            order_id = serializer.validated_data.get('order_id')
            
            payment = Payment.objects.create(
                user=request.user,
                amount=amount,
                payment_method=payment_method,
                order_id=order_id if order_id else None
            )
            
            if payment_method == 'click':
                result = ClickPaymentService.create_payment(amount, payment.id)
            elif payment_method == 'payme':
                result = PaymePaymentService.create_payment(amount, payment.id)
            elif payment_method == 'uzum':
                result = UzumPaymentService.create_payment(amount, payment.id)
            else:
                return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)
            
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
            
            return Response(PaymentSerializer(payment).data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class PaymentStatusView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer})
    def get(self, request, pk):
        try:
            payment = Payment.objects.get(pk=pk, user=request.user)
            serializer = PaymentSerializer(payment)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            return Response({'error': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)


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
            
            if payment_method == 'click':
                verification_passed, error_message = self._verify_click_callback(request, payment, callback_data)
                if verification_passed and callback_data.get('action') == 0 and callback_data.get('error') == 0:
                    payment.payment_status = 'completed'
                    payment.paid_at = timezone.now()
            elif payment_method == 'payme':
                verification_passed, error_message = self._verify_payme_callback(request, payment, callback_data)
                if verification_passed:
                    result = callback_data.get('result', {})
                    if result.get('state') == 2:
                        payment.payment_status = 'completed'
                        payment.paid_at = timezone.now()
            elif payment_method == 'uzum':
                verification_passed, error_message = self._verify_uzum_callback(request, payment, callback_data)
                if verification_passed and callback_data.get('status') == 'success':
                    payment.payment_status = 'completed'
                    payment.paid_at = timezone.now()
            else:
                return Response({'error': 'Invalid payment method'}, status=status.HTTP_400_BAD_REQUEST)
            
            if not verification_passed:
                PaymentHistory.objects.create(
                    payment=payment,
                    status=old_status,
                    status_new='failed',
                    gateway_response={'error': error_message, 'callback_data': callback_data}
                )
                return Response({'error': error_message or 'Verification failed'}, status=status.HTTP_400_BAD_REQUEST)
            
            payment.gateway_response = callback_data
            payment.save()
            
            PaymentHistory.objects.create(
                payment=payment,
                status=old_status,
                status_new=payment.payment_status,
                gateway_response=callback_data
            )
            
            return Response({'status': 'success'}, status=status.HTTP_200_OK)
        except Payment.DoesNotExist:
            return Response({'error': 'Payment not found'}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class MyPaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer(many=True)})
    def get(self, request):
        payments = Payment.objects.filter(user=request.user)
        serializer = PaymentSerializer(payments, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class OrderPaymentsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: PaymentSerializer(many=True)})
    def get(self, request, order_id):
        try:
            order = Order.objects.get(pk=order_id)
            if order.driver != request.user and order.client != request.user:
                return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)
            
            payments = Payment.objects.filter(order=order)
            serializer = PaymentSerializer(payments, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)
