from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.throttling import AnonRateThrottle
from drf_spectacular.utils import extend_schema
from apps.common.services import generate_sms_code, send_sms_code, save_sms_code, verify_sms_code
from apps.users.phone import is_valid_uz_phone, normalize_phone


class SMSThrottle(AnonRateThrottle):
    """Throttle for SMS endpoints."""
    scope = 'sms'


class SendSMSCodeView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SMSThrottle]

    @extend_schema(responses={200: {'type': 'object', 'properties': {'message': {'type': 'string'}}}})
    def post(self, request):
        phone = normalize_phone(request.data.get('phone'))

        if not phone:
            return Response({'error': 'Phone is required'}, status=status.HTTP_400_BAD_REQUEST)
        if not is_valid_uz_phone(phone):
            return Response(
                {'error': 'Telefon raqam formati noto\'g\'ri. Masalan: +998901234567'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        code = generate_sms_code()
        save_sms_code(phone, code)

        if send_sms_code(phone, code):
            return Response({'message': 'SMS code sent successfully'}, status=status.HTTP_200_OK)

        return Response({'error': 'Failed to send SMS code'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


class VerifySMSView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [SMSThrottle]

    @extend_schema(responses={200: {'type': 'object', 'properties': {'message': {'type': 'string'}}}})
    def post(self, request):
        phone = normalize_phone(request.data.get('phone'))
        code = request.data.get('code')

        if not phone or not code:
            return Response({'error': 'Phone and code are required'}, status=status.HTTP_400_BAD_REQUEST)

        from apps.common.services import is_phone_sms_verified

        if verify_sms_code(phone, code) or is_phone_sms_verified(phone):
            return Response({'message': 'Code verified successfully'}, status=status.HTTP_200_OK)

        return Response({'error': 'Invalid code'}, status=status.HTTP_400_BAD_REQUEST)

