from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from drf_spectacular.utils import extend_schema
import logging
from apps.orders.models import Order
from apps.users.models import User
from apps.users.permissions import IsStaffModerator
from .models import Complaint
from .serializers import (
    ComplaintSerializer,
    ComplaintCreateSerializer,
    ComplaintStaffSerializer,
    ComplaintResolveSerializer,
)

logger = logging.getLogger(__name__)


class ComplaintCreateView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(request=ComplaintCreateSerializer, responses={201: ComplaintSerializer})
    def post(self, request):
        serializer = ComplaintCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        order_id = serializer.validated_data['order_id']
        to_user_id = serializer.validated_data['to_user_id']

        try:
            order = Order.objects.get(pk=order_id)
        except Order.DoesNotExist:
            return Response({'error': 'Order not found'}, status=status.HTTP_404_NOT_FOUND)

        if order.driver != request.user and order.client != request.user:
            return Response({'error': 'Permission denied'}, status=status.HTTP_403_FORBIDDEN)

        active_codes = {'in_progress', 'in_transit', 'completed'}
        if order.status.code not in active_codes:
            return Response(
                {'error': 'Complaint can only be filed for active or completed orders'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            to_user = User.objects.get(pk=to_user_id)
        except User.DoesNotExist:
            return Response({'error': 'User not found'}, status=status.HTTP_404_NOT_FOUND)

        if to_user == request.user:
            return Response({'error': 'You cannot file a complaint against yourself'}, status=status.HTTP_400_BAD_REQUEST)

        if order.driver != to_user and order.client != to_user:
            return Response({'error': 'User is not related to this order'}, status=status.HTTP_400_BAD_REQUEST)

        if Complaint.objects.filter(
            order=order,
            from_user=request.user,
            to_user=to_user,
        ).exists():
            return Response(
                {'error': 'Bu buyurtma uchun shikoyat allaqachon yuborilgan'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        complaint = Complaint.objects.create(
            order=order,
            from_user=request.user,
            to_user=to_user,
            category=serializer.validated_data['category'],
            description=serializer.validated_data['description'],
        )

        try:
            from apps.payments.escrow import hold_on_complaint
            hold_on_complaint(complaint)
        except Exception:
            logger.exception(
                'Failed to hold funds for complaint',
                extra={'event': 'complaint_hold_failed'},
            )

        try:
            from apps.ratings.complaint_notifications import notify_staff_complaint_filed

            notify_staff_complaint_filed(complaint)
        except Exception:
            logger.exception(
                'Failed to notify staff about complaint',
                extra={'event': 'complaint_staff_notify_failed'},
            )

        return Response(
            ComplaintSerializer(complaint, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ComplaintListView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses={200: ComplaintSerializer(many=True)})
    def get(self, request):
        direction = request.query_params.get('direction', 'filed')
        if direction == 'received':
            complaints = Complaint.objects.filter(to_user=request.user)
        else:
            complaints = Complaint.objects.filter(from_user=request.user)

        order_id = request.query_params.get('order_id')
        if order_id:
            complaints = complaints.filter(order_id=order_id)

        serializer = ComplaintSerializer(complaints[:100], many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ComplaintStaffListView(APIView):
    permission_classes = [IsAuthenticated, IsStaffModerator]

    @extend_schema(responses={200: ComplaintStaffSerializer(many=True)})
    def get(self, request):
        complaints = Complaint.objects.select_related('order', 'from_user', 'to_user').order_by('-created_at')
        status_filter = request.query_params.get('status')
        if status_filter:
            complaints = complaints.filter(status=status_filter)
        order_id = request.query_params.get('order_id')
        if order_id:
            complaints = complaints.filter(order_id=order_id)
        serializer = ComplaintStaffSerializer(complaints[:200], many=True, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class ComplaintResolveView(APIView):
    permission_classes = [IsAuthenticated, IsStaffModerator]

    @extend_schema(request=ComplaintResolveSerializer, responses={200: ComplaintStaffSerializer})
    def post(self, request, pk):
        try:
            complaint = Complaint.objects.select_related('order', 'from_user', 'to_user').get(pk=pk)
        except Complaint.DoesNotExist:
            return Response({'error': 'Complaint not found'}, status=status.HTTP_404_NOT_FOUND)

        serializer = ComplaintResolveSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        new_status = serializer.validated_data['status']
        if complaint.status in ('resolved', 'dismissed') and new_status != complaint.status:
            return Response(
                {'error': 'Closed complaints cannot be reopened via API'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        complaint.status = new_status
        if 'admin_notes' in serializer.validated_data:
            complaint.admin_notes = serializer.validated_data['admin_notes']
        complaint.save(update_fields=['status', 'admin_notes', 'updated_at'])

        settlement = serializer.validated_data.get('settlement', 'release')
        if new_status == 'dismissed':
            settlement = 'release'
        if new_status in ('resolved', 'dismissed'):
            from apps.payments.escrow import resolve_complaint_settlement
            from decimal import Decimal
            driver_share = serializer.validated_data.get('driver_share')
            resolve_complaint_settlement(
                complaint,
                settlement=settlement,
                driver_share=Decimal(str(driver_share)) if driver_share is not None else None,
            )

        if new_status == 'resolved':
            action = serializer.validated_data.get('action', 'none')
            if action and action != 'none':
                from apps.ratings.enforcement import apply_complaint_resolution_action

                apply_complaint_resolution_action(
                    complaint.to_user,
                    action=action,
                    complaint=complaint,
                )

        if new_status in ('resolved', 'dismissed'):
            from apps.notifications.services import create_notification

            status_label = 'hal qilindi' if new_status == 'resolved' else 'rad etildi'
            message = f"Shikoyatingiz (#{complaint.id}) {status_label}."
            create_notification(
                user=complaint.from_user,
                notification_type='system',
                title='Shikoyat holati yangilandi',
                message=message,
                order=complaint.order,
            )
            create_notification(
                user=complaint.to_user,
                notification_type='system',
                title='Shikoyat ko\'rib chiqildi',
                message=f"Buyurtma #{complaint.order_id} bo'yicha shikoyat {status_label}.",
                order=complaint.order,
            )

        return Response(
            ComplaintStaffSerializer(complaint, context={'request': request}).data,
            status=status.HTTP_200_OK,
        )
