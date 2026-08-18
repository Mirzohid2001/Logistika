import uuid

from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.common.exceptions import NotFoundError, PermissionDeniedError, ValidationError
from apps.notifications.services import create_notification
from apps.payments.models import Payment, PaymentHistory
from apps.payments.gateway_init import initiate_gateway_payment
from apps.payments.serializers import PaymentSerializer

from .models import SubscriptionPlan
from .serializers import SubscribeSerializer, SubscriptionPlanSerializer, UserSubscriptionSerializer
from apps.users.roles import subscription_audience

from .services import (
    activate_subscription,
    calculate_plan_pricing,
    get_active_subscription,
    get_plans_for_user,
    get_subscription_status_payload,
    user_requires_subscription,
)

User = get_user_model()


class SubscriptionPlanListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: SubscriptionPlanSerializer(many=True)})
    def get(self, request):
        plans = get_plans_for_user(request.user)
        serializer = SubscriptionPlanSerializer(plans, many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class MySubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        lang = request.headers.get('Accept-Language', 'ru').split(',')[0].split('-')[0]
        payload = get_subscription_status_payload(request.user, lang=lang)
        active = get_active_subscription(request.user)
        history = None
        if active:
            history = UserSubscriptionSerializer(active, context={'request': request}).data
        return Response(
            {
                **payload,
                'subscription': history,
            },
            status=status.HTTP_200_OK,
        )


class SubscribeView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=SubscribeSerializer, responses={201: UserSubscriptionSerializer})
    def post(self, request):
        if not user_requires_subscription(request.user):
            raise PermissionDeniedError(detail='Sizning rolingiz uchun obuna talab qilinmaydi')

        serializer = SubscribeSerializer(data=request.data)
        if not serializer.is_valid():
            raise ValidationError(detail=serializer.errors)

        plan_id = serializer.validated_data['plan_id']
        payment_method = serializer.validated_data['payment_method']

        try:
            plan = SubscriptionPlan.objects.get(pk=plan_id, is_active=True)
        except SubscriptionPlan.DoesNotExist:
            raise NotFoundError(detail='Obuna tarifi topilmadi')

        expected_audience = subscription_audience(request.user)
        if not expected_audience or plan.audience != expected_audience:
            raise ValidationError(detail='Bu tarif sizning rolingiz uchun mos emas')

        pricing = calculate_plan_pricing(plan, request.user)

        with transaction.atomic():
            User.objects.select_for_update().get(pk=request.user.pk)

            recent_payment = Payment.objects.filter(
                user=request.user,
                payment_status='completed',
                paid_at__gte=timezone.now() - timedelta(seconds=60),
                gateway_response__purpose='subscription',
            ).first()
            if recent_payment:
                active = get_active_subscription(request.user)
                if active:
                    return Response(
                        {
                            'subscription': UserSubscriptionSerializer(active, context={'request': request}).data,
                            'status': get_subscription_status_payload(request.user),
                        },
                        status=status.HTTP_200_OK,
                    )

            payment = Payment.objects.create(
                user=request.user,
                amount=pricing['charge_amount'],
                payment_method=payment_method,
                order=None,
            )

            if payment_method == 'mock':
                if not getattr(settings, 'PAYMENTS_ALLOW_MOCK', False):
                    raise PermissionDeniedError(detail='Mock to\'lov usuli o\'chirilgan')
                payment.payment_status = 'completed'
                payment.paid_at = timezone.now()
                payment.transaction_id = f'mock-sub-{payment.pk}-{uuid.uuid4().hex[:10]}'
                payment.gateway_response = {
                    'mock': True,
                    'purpose': 'subscription',
                    'plan_id': plan.id,
                    'plan_code': plan.code,
                    'list_price': str(pricing['list_price']),
                    'charged_amount': str(pricing['charge_amount']),
                    'intro_discount_percent': pricing['discount_percent'],
                    'is_intro_purchase': pricing['is_intro_purchase'],
                }
                payment.save()
                PaymentHistory.objects.create(
                    payment=payment,
                    status='pending',
                    status_new='completed',
                    gateway_response=payment.gateway_response,
                )
                subscription = activate_subscription(
                    request.user,
                    plan,
                    payment=payment,
                    list_price=pricing['list_price'],
                    charged_amount=pricing['charge_amount'],
                    intro_discount_percent=pricing['discount_percent'],
                    is_intro_purchase=pricing['is_intro_purchase'],
                )
            else:
                payment.gateway_response = {
                    'purpose': 'subscription',
                    'plan_id': plan.id,
                    'plan_code': plan.code,
                    'list_price': str(pricing['list_price']),
                    'charged_amount': str(pricing['charge_amount']),
                    'intro_discount_percent': pricing['discount_percent'],
                    'is_intro_purchase': pricing['is_intro_purchase'],
                }
                payment.save(update_fields=['gateway_response', 'updated_at'])
                initiate_gateway_payment(payment)
                payment = Payment.objects.get(pk=payment.pk)
                return Response(
                    {
                        'subscription': None,
                        'payment': PaymentSerializer(payment, context={'request': request}).data,
                        'status': get_subscription_status_payload(request.user),
                        'checkout_required': True,
                    },
                    status=status.HTTP_201_CREATED,
                )

        try:
            create_notification(
                user=request.user,
                notification_type='payment_received',
                title='Obuna faollashtirildi',
                message=f'"{plan.name_uz}" obunasi muvaffaqiyatli faollashtirildi.',
            )
        except Exception:
            pass

        return Response(
            {
                'subscription': UserSubscriptionSerializer(subscription, context={'request': request}).data,
                'status': get_subscription_status_payload(request.user),
            },
            status=status.HTTP_201_CREATED,
        )
