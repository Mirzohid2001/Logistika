# Push Notification E2E Checklist

Bu checklist Firebase push bildirishnomalarini **haqiqiy qurilmalarda** (simulyator emas) tekshirish uchun.

Bog'liq hujjatlar:
- `INSTALLATION_GUIDE.md` — Firebase fayllarini joylash
- `REALTIME_TRACKING_E2E_CHECKLIST.md` — GPS / dispatcher tracking

---

## 0) Oldindan tayyorgarlik

### Backend (`.env`)
- [ ] `FCM_SERVER_KEY` yoki Firebase HTTP v1 credential sozlangan
- [ ] `PUSH_MAX_RETRY_ATTEMPTS` va `PUSH_RETRY_BACKOFF_SECONDS` (ixtiyoriy, default ishlaydi)
- [ ] Celery worker + beat ishlayapti (`retry_failed_push_notifications` task)
- [ ] Migratsiyalar qo'llangan (`notifications.0006_*`)

### Mobile — Firebase fayllar
- [ ] Android: `mobile/android/app/google-services.json` (`.example` dan nusxa + haqiqiy qiymatlar)
- [ ] iOS: `mobile/ios/Logistika/GoogleService-Info.plist` (`.example` dan nusxa)
- [ ] `.gitignore` haqiqiy credential fayllarni commit qilmaydi

### Qurilmalar
- [ ] Kamida **2 ta haqiqiy telefon** (Android + iOS ideal)
- [ ] Ilova yangi build bilan o'rnatilgan (`npx react-native run-android` / `run-ios`)
- [ ] Foydalanuvchi login qilgan va **FCM token** backendga yozilgan

### Token tekshiruvi
1. Mobile: login → ilova push ruxsatini so'rashi kerak
2. Backend admin yoki DB: `users_user.fcm_token` to'ldirilgan
3. API: `PATCH /api/users/fcm-token/` muvaffaqiyatli

---

## 1) Dastlabki ishga tushirish

- [ ] Ilova birinchi marta ochilganda push permission dialog chiqadi
- [ ] Ruxsat berilganda console/logda xato yo'q
- [ ] Ruxsat rad etilsa — ilova crash qilmaydi, in-app bildirishnomalar ishlaydi
- [ ] `google-services.json` / `GoogleService-Info.plist` yo'q bo'lsa — aniq ogohlantirish (dev build)

---

## 2) Foreground push

**Stsenariy:** ilova ochiq, foydalanuvchi Notifications yoki boshqa ekranda.

- [ ] Backend `create_notification(..., send_push=True)` chaqiriladi (masalan, yangi bid yoki system xabar)
- [ ] Telefonda **local notification** (Notifee) ko'rinadi
- [ ] Bildirishnoma ro'yxatida ham yangi yozuv paydo bo'ladi
- [ ] Push bosilganda to'g'ri ekranga navigatsiya (order/chat/bids)

**Tekshirish buyruqlari (Django shell):**
```python
from apps.users.models import User
from apps.notifications.services import create_notification
u = User.objects.get(phone='998901112233')
create_notification(u, 'system', 'Test', 'Foreground push test', send_push=True)
```

---

## 3) Background push

**Stsenariy:** ilova orqa fonda (home tugmasi).

- [ ] Push tizim tray'da ko'rinadi
- [ ] Traydan bosganda ilova ochiladi va to'g'ri ekranga o'tadi
- [ ] `data.type` va `data.order_id` payload to'g'ri parse qilinadi

---

## 4) Killed state (ilova to'liq yopilgan)

- [ ] Push trayda keladi
- [ ] Bosganda cold start + navigatsiya ishlaydi
- [ ] Token yo'qolmaydi (qayta login talab qilinmasin)

---

## 5) Notification preferences (opt-out)

API: `GET/PATCH /api/notifications/preferences/`

- [ ] **Global push off** → push kelmaydi, in-app keladi
- [ ] **Global in-app off** → ro'yxatda ko'rinmaydi, push (agar yoqilgan bo'lsa) keladi
- [ ] **Tur bo'yicha opt-out** (masalan `bid_received` push off) → faqat shu tur push kelmaydi
- [ ] Mobile: Profil → Bildirishnoma sozlamalari — toggle saqlanadi va backend bilan mos

---

## 6) Push retry / failed queue

**Stsenariy:** noto'g'ri token yoki vaqtincha FCM xatosi.

- [ ] `PushDeliveryQueue` da yozuv yaratiladi (`status=pending/failed`)
- [ ] `attempts` oshadi, `next_retry_at` belgilanadi
- [ ] Celery `retry_failed_push_notifications` muvaffaqiyatli yuboradi → `status=sent`
- [ ] `max_attempts` dan keyin `status=dead`
- [ ] Admin: `/admin/notifications/pushdeliveryqueue/` yozuvlarni ko'rsatadi

**Simulyatsiya:** foydalanuvchi `fcm_token` ni `invalid-token` qiling, keyin notification yuboring.

---

## 7) Maxsus hodisa turlari

| Tur | Trigger | Kutilgan natija |
|-----|---------|----------------|
| `bid_received` | Haydovchi taklif yuboradi | Mijoz push + in-app |
| `stop_alert` | Haydovchi 5+ daqiqa to'xtagan | Mijoz + dispatcher |
| `route_deviation` | Marshrutdan chiqish | Dispatcher |
| `route_stop_arrived` | Geofence — marshrut nuqtasi | Mijoz + dispatcher |
| `geofence_event` | Pickup/destination geofence | Mijoz + dispatcher |
| `message_received` | Chat xabari | Qabul qiluvchi |

Har bir qator uchun kamida bitta real test:
- [ ] Push keldi
- [ ] To'g'ri ekranga ochiladi
- [ ] Opt-out qilinganda kelmaydi

---

## 8) Platforma farqlari

### Android
- [ ] `google-services` plugin build.gradle da qo'llangan
- [ ] Android 13+ notification permission
- [ ] Background restriction yo'q (battery optimization off — test uchun)

### iOS
- [ ] `pod install` qilingan
- [ ] Push capability Xcode loyihasida yoqilgan
- [ ] APNs orqali FCM ishlaydi (development/production profil mos)
- [ ] Foreground da banner ko'rinadi

---

## 9) Badge va unread count

- [ ] Yangi bildirishnoma → tab badge oshadi
- [ ] O'qildi deb belgilanganda badge kamayadi
- [ ] `mark-all-read` badge ni nolga tushiradi

---

## 10) Qabul mezonlari (Acceptance)

| Metrika | Maqsad |
|---------|--------|
| Push yetkazish (foreground) | < 5 soniya |
| Push yetkazish (background) | < 15 soniya |
| Retry muvaffaqiyati | 3 urinish ichida yoki `dead` ga tushadi |
| Opt-out | 100% hurmat qilinadi |
| Crash | Push test davomida 0 crash |
| Duplicate push | Bir hodisa = bir push (qayta-yuborishdan tashqari) |

---

## 11) Tez diagnostika

| Muammo | Tekshiring |
|--------|------------|
| Push umuman kelmaydi | `fcm_token`, `google-services.json`, `FCM_SERVER_KEY` |
| Faqat Android ishlamaydi | Package name Firebase bilan mosligi (`com.logistikatemp`) |
| Faqat iOS ishlamaydi | `GoogleService-Info.plist`, APNs key, Push capability |
| Push keladi, navigatsiya yo'q | `data.type`, `notificationNavigation.ts` |
| Retry ishlamaydi | Celery beat, `PushDeliveryQueue.next_retry_at` |
| Opt-out ishlamaydi | `UserNotificationSettings`, `NotificationPreference` |

---

## 12) Testdan keyin

- [ ] Test foydalanuvchilarning `fcm_token` tozalangan (agar kerak bo'lsa)
- [ ] `PushDeliveryQueue` dead yozuvlari ko'rib chiqilgan
- [ ] Production credential repoga commit qilinmagan
