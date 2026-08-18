from __future__ import annotations

from django.db.models import Q

from apps.users.models import User


VERIFICATION_NOT_SUBMITTED = 'not_submitted'
VERIFICATION_PENDING = 'pending'
VERIFICATION_APPROVED = 'approved'
VERIFICATION_REJECTED = 'rejected'

VERIFICATION_STATUS_CHOICES = [
    (VERIFICATION_NOT_SUBMITTED, 'Not submitted'),
    (VERIFICATION_PENDING, 'Pending review'),
    (VERIFICATION_APPROVED, 'Approved'),
    (VERIFICATION_REJECTED, 'Rejected'),
]


def sync_user_verified_flag(user: User) -> None:
    user.is_verified = user.verification_status == VERIFICATION_APPROVED


def infer_initial_user_verification_status(user: User) -> str:
    if user.is_verified:
        return VERIFICATION_APPROVED
    if user.document_photos:
        return VERIFICATION_PENDING
    return VERIFICATION_NOT_SUBMITTED


def get_verification_reviewers():
    return User.objects.filter(
        Q(is_staff=True) | Q(is_dispatcher=True) | Q(is_admin=True) | Q(is_operator=True),
        is_active=True,
    ).distinct()


def is_driver_marketplace_eligible(user) -> bool:
    """Driver may bid/accept after admin approval (legacy is_verified still honored)."""
    from apps.users.enforcement import user_is_marketplace_banned

    if user_is_marketplace_banned(user):
        return False
    status = getattr(user, 'verification_status', None)
    if status == VERIFICATION_REJECTED:
        return False
    if status == VERIFICATION_APPROVED:
        return True
    return bool(getattr(user, 'is_verified', False))


def driver_has_approved_vehicle(user) -> bool:
    from django.db.models import Q

    from apps.vehicles.models import Vehicle

    return Vehicle.objects.filter(user=user).filter(
        Q(verification_status=VERIFICATION_APPROVED)
        | Q(
            is_verified=True,
            verification_status__in=[VERIFICATION_NOT_SUBMITTED, VERIFICATION_PENDING],
        )
    ).exists()


def mark_driver_verification_approved(user: User, *, notify: bool = True) -> None:
    user.verification_status = VERIFICATION_APPROVED
    sync_user_verified_flag(user)
    user.save(update_fields=['verification_status', 'is_verified', 'updated_at'])
    if notify:
        notify_driver_verification_decision(user, approved=True)


def mark_driver_verification_rejected(user: User, *, notify: bool = True) -> None:
    user.verification_status = VERIFICATION_REJECTED
    sync_user_verified_flag(user)
    user.save(update_fields=['verification_status', 'is_verified', 'updated_at'])
    if notify:
        notify_driver_verification_decision(user, approved=False)


def mark_driver_verification_pending(user: User, *, notify: bool = True, save_fields: list[str] | None = None) -> None:
    user.verification_status = VERIFICATION_PENDING
    sync_user_verified_flag(user)
    fields = list(save_fields or [])
    for field in ('verification_status', 'is_verified', 'updated_at'):
        if field not in fields:
            fields.append(field)
    user.save(update_fields=fields)
    if notify:
        notify_driver_verification_submitted(user)


def mark_vehicle_verification_pending(vehicle, *, notify: bool = True, save_fields: list[str] | None = None) -> None:
    vehicle.verification_status = VERIFICATION_PENDING
    vehicle.is_verified = False
    fields = list(save_fields or [])
    for field in ('verification_status', 'is_verified', 'updated_at'):
        if field not in fields:
            fields.append(field)
    vehicle.save(update_fields=fields)
    if notify:
        notify_vehicle_verification_submitted(vehicle)


def notify_driver_verification_decision(driver: User, *, approved: bool) -> None:
    from apps.notifications.services import create_notification

    if approved:
        create_notification(
            user=driver,
            notification_type='driver_verification_approved',
            title='Hisob tasdiqlandi',
            message='Hujjatlaringiz tasdiqlandi. Endi taklif berish va buyurtma olish mumkin.',
            send_push=True,
        )
    else:
        create_notification(
            user=driver,
            notification_type='driver_verification_rejected',
            title='Hujjatlar rad etildi',
            message='Hujjatlaringiz rad etildi. To\'g\'ri hujjatlarni qayta yuklang.',
            send_push=True,
        )


def notify_vehicle_verification_decision(vehicle, *, approved: bool) -> None:
    from apps.notifications.services import create_notification

    driver = vehicle.user
    label = f'{vehicle.make} {vehicle.model} ({vehicle.number})'
    if approved:
        create_notification(
            user=driver,
            notification_type='vehicle_verification_approved',
            title='Transport tasdiqlandi',
            message=f'{label} admin tomonidan tasdiqlandi.',
            send_push=True,
        )
    else:
        create_notification(
            user=driver,
            notification_type='vehicle_verification_rejected',
            title='Transport rad etildi',
            message=f'{label} rad etildi. Hujjatlarni yangilab qayta yuboring.',
            send_push=True,
        )


def notify_driver_verification_submitted(driver: User) -> None:
    from apps.notifications.services import create_notification

    driver_name = f'{driver.first_name} {driver.last_name}'.strip() or driver.phone
    title = 'Haydovchi hujjatlari yuklandi'
    message = f'{driver_name} ({driver.phone}) hujjatlarini yukladi. Ko\'rib chiqish kerak.'
    for reviewer in get_verification_reviewers():
        create_notification(
            user=reviewer,
            notification_type='driver_verification_pending',
            title=title,
            message=message,
            send_push=True,
        )


def notify_vehicle_verification_submitted(vehicle) -> None:
    from apps.notifications.services import create_notification

    driver = vehicle.user
    driver_name = f'{driver.first_name} {driver.last_name}'.strip() or driver.phone
    title = 'Transport hujjatlari yukildi'
    message = (
        f'{vehicle.make} {vehicle.model} ({vehicle.number}) — '
        f'{driver_name}. Ko\'rib chiqish kerak.'
    )
    for reviewer in get_verification_reviewers():
        create_notification(
            user=reviewer,
            notification_type='vehicle_verification_pending',
            title=title,
            message=message,
            send_push=True,
        )
