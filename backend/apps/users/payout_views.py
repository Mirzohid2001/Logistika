from decimal import Decimal, InvalidOperation

from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.utils import extend_schema

from apps.orders.financial import driver_available_payout_balance, driver_earnings_payload
from apps.users.models import DriverPayoutRequest
from apps.users.permissions import IsDriver
from apps.common.openapi import PayoutRequestSerializer


class DriverPayoutRequestListCreateView(APIView):
    permission_classes = [IsAuthenticated, IsDriver]

    @extend_schema(responses={200: {'type': 'object'}})
    def get(self, request):
        payouts = DriverPayoutRequest.objects.filter(user=request.user)[:50]
        earnings = driver_earnings_payload(request.user)
        return Response({
            'available_balance': earnings['available_balance'],
            'total_earnings': earnings['total_earnings'],
            'results': [
                {
                    'id': payout.id,
                    'amount': float(payout.amount),
                    'bank_details': payout.bank_details,
                    'status': payout.status,
                    'admin_note': payout.admin_note,
                    'created_at': payout.created_at.isoformat(),
                    'updated_at': payout.updated_at.isoformat(),
                }
                for payout in payouts
            ],
        })

    @extend_schema(
        request=PayoutRequestSerializer,
        responses={201: {'type': 'object'}},
    )
    def post(self, request):
        raw_amount = request.data.get('amount')
        bank_details = (request.data.get('bank_details') or '').strip()
        try:
            amount = Decimal(str(raw_amount))
        except (InvalidOperation, TypeError, ValueError):
            return Response({'error': 'Noto\'g\'ri summa'}, status=status.HTTP_400_BAD_REQUEST)
        if amount <= 0:
            return Response({'error': 'Summa 0 dan katta bo\'lishi kerak'}, status=status.HTTP_400_BAD_REQUEST)

        available = driver_available_payout_balance(request.user)
        if amount > available:
            return Response(
                {
                    'error': 'Mavjud balans yetarli emas',
                    'available_balance': float(available),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending = DriverPayoutRequest.objects.filter(
            user=request.user,
            status=DriverPayoutRequest.STATUS_PENDING,
        ).exists()
        if pending:
            return Response({'error': 'Kutilayotgan so\'rov mavjud'}, status=status.HTTP_400_BAD_REQUEST)

        payout = DriverPayoutRequest.objects.create(
            user=request.user,
            amount=amount,
            bank_details=bank_details,
        )
        try:
            from apps.payments.ledger import debit_available
            from apps.payments.models import LedgerEntry
            debit_available(
                request.user,
                amount,
                entry_type=LedgerEntry.TYPE_PAYOUT_RESERVE,
                idempotency_key=f'payout_reserve:{payout.id}',
                note=f'Payout request #{payout.id}',
                payout_request=payout,
            )
        except ValueError:
            payout.delete()
            return Response(
                {'error': 'Mavjud balans yetarli emas', 'available_balance': float(available)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response({
            'id': payout.id,
            'amount': float(payout.amount),
            'bank_details': payout.bank_details,
            'status': payout.status,
            'created_at': payout.created_at.isoformat(),
        }, status=status.HTTP_201_CREATED)
