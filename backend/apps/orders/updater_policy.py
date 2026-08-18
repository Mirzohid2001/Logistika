from apps.common.exceptions import PermissionDeniedError, ValidationError
from apps.orders.services import TERMINAL_ORDER_STATUS_CODES, order_accepts_location_updates

# Haydovchi jarayoni (POD, to'lov, marshrut) talab qiladigan holatlar
UPDATER_FORBIDDEN_STATUS_CODES = frozenset({
    'completed',
    'in_transit',
    'in_progress',
    'approved_by_client',
})


def assert_updater_may_change_status(order, new_status_code: str) -> None:
    if new_status_code in UPDATER_FORBIDDEN_STATUS_CODES:
        raise PermissionDeniedError(
            detail=(
                f'Updater «{new_status_code}» holatini o\'zgartira olmaydi — '
                'haydovchi jarayoni (POD, to\'lov, marshrut) talab qilinadi.'
            )
        )
    current = order.status.code if order.status else None
    if current in TERMINAL_ORDER_STATUS_CODES and new_status_code != current:
        raise ValidationError(detail='Terminal buyurtma holati updater orqali o\'zgartirilmaydi')


def assert_updater_may_update_location(order) -> None:
    status_code = order.status.code if order.status else None
    if not order_accepts_location_updates(status_code):
        raise PermissionDeniedError(
            detail='Joylashuv yangilash faqat faol yo\'lda bo\'lgan buyurtmalar uchun mumkin.'
        )


def assert_updater_may_touch_order_payment() -> None:
    raise PermissionDeniedError(
        detail='Buyurtma to\'lovi platformada emas — shafyor va mijoz o\'zlari hal qiladi.'
    )
