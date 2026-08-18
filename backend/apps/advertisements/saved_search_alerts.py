from apps.advertisements.models import Advertisement, SavedSearch
from apps.advertisements.saved_search_matching import advertisement_matches_saved_search
from apps.notifications.models import Notification
from apps.notifications.services import create_notification


def notify_saved_search_matches(advertisement: Advertisement) -> int:
    """Notify drivers whose saved searches match a newly created advertisement."""
    if advertisement.is_closed:
        return 0

    from apps.users.document_expiry import expired_driver_user_ids

    searches = SavedSearch.objects.filter(
        alerts_enabled=True,
        user__is_driver=True,
    ).exclude(
        user_id=advertisement.client_id,
    ).select_related('user')
    expired_ids = list(expired_driver_user_ids())
    if expired_ids:
        searches = searches.exclude(user_id__in=expired_ids)

    sent = 0
    for saved_search in searches:
        if not advertisement_matches_saved_search(advertisement, saved_search):
            continue
        already_sent = Notification.objects.filter(
            user=saved_search.user,
            advertisement=advertisement,
            notification_type='saved_search_match',
        ).exists()
        if already_sent:
            continue

        title = advertisement.title_uz or advertisement.title_ru or "Yangi e'lon"
        create_notification(
            user=saved_search.user,
            notification_type='saved_search_match',
            title="Saqlangan qidiruv bo'yicha yangi e'lon",
            message=(
                f"«{saved_search.name}» qidiruvingizga mos yangi e'lon: {title}. "
                f"Narxi: {advertisement.proposed_cost or 'kelishiladi'} so'm."
            ),
            advertisement=advertisement,
            send_push=True,
        )
        sent += 1
    return sent
