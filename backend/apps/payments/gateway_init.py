from apps.common.exceptions import ExternalServiceError, PaymentError

from .models import Payment, PaymentHistory
from .services import ClickPaymentService, PaymePaymentService, UzumPaymentService


def initiate_gateway_payment(payment: Payment, *, order_id=None) -> dict:
    """Call external gateway and persist processing state on the payment."""
    payment_method = payment.payment_method
    amount = payment.amount

    if payment_method == 'click':
        result = ClickPaymentService.create_payment(amount, payment.id, order_id=order_id)
    elif payment_method == 'payme':
        result = PaymePaymentService.create_payment(amount, order_id or payment.id)
    elif payment_method == 'uzum':
        result = UzumPaymentService.create_payment(amount, order_id or payment.id)
    else:
        raise PaymentError(detail='Noto\'g\'ri to\'lov usuli')

    if not result:
        payment.payment_status = 'failed'
        payment.save(update_fields=['payment_status', 'updated_at'])
        raise ExternalServiceError(detail='To\'lov gateway javob bermadi')

    existing = payment.gateway_response if isinstance(payment.gateway_response, dict) else {}
    payment.gateway_response = {**existing, **result}
    payment.transaction_id = result.get('transaction_id') or result.get('id') or str(payment.id)
    payment.save(update_fields=['gateway_response', 'transaction_id', 'updated_at'])

    PaymentHistory.objects.create(
        payment=payment,
        status='pending',
        status_new='processing',
        gateway_response=payment.gateway_response,
    )
    return payment.gateway_response
