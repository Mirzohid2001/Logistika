# Paketlar o'rnatish va sozlash

## 1. Paketlarni o'rnatish

```bash
cd mobile
npm install
```

## 2. iOS uchun Pod o'rnatish

```bash
cd ios
pod install
cd ..
```

## 3. Android uchun qo'shimcha sozlamalar

Android uchun `android/app/build.gradle` faylida quyidagilarni tekshiring:

```gradle
android {
    compileSdkVersion 33
    // ...
    defaultConfig {
        // ...
        minSdkVersion 21
        targetSdkVersion 33
    }
}
```

## 4. Ilovani qayta build qilish

### iOS:
```bash
npx react-native run-ios
```

### Android:
```bash
npx react-native run-android
```

## 5. Native modullar

Agar paketlar o'rnatilgandan keyin ham ishlamasa:

### iOS:
1. Xcode'da `ios/Logistika.xcworkspace` ni oching
2. Product > Clean Build Folder
3. Product > Build

### Android:
1. `cd android && ./gradlew clean`
2. `cd .. && npx react-native run-android`

## 6. Xaritalar (MapLibre + OpenStreetMap)

Xarita ekranlari **MapLibre + OSM** ishlatadi. API key talab qilinmaydi.

Tile manbasi: `mobile/src/config/mapStyle.ts`

Production uchun o'z tile serveringiz yoki [MapTiler](https://www.maptiler.com/) bepul limitidan foydalaning (OSM public tile server faqat test uchun).

```bash
cd ios
export LANG=en_US.UTF-8
pod install
cd ..
```

**Muhim:**
- Xcode'da `Logistika.xcodeproj` emas, **`Logistika.xcworkspace`** oching.
- Scheme sifatida **`Logistika`** tanlang (`LogistikaTemp` emas!).
- Aks holda `No such module 'GoogleMaps'` yoki `Undefined symbol: _OBJC_CLASS_$_RCTBridge` chiqadi.

Agar xato qolsa: Xcode → Product → Clean Build Folder, keyin qayta build.

Terminaldan ishga tushirish:
```bash
cd mobile
npx react-native run-ios --scheme Logistika
```

Google Cloud Console'da **Maps SDK for Android** va **Maps SDK for iOS** yoqilgan bo'lishi kerak.

## 7. Firebase Push Notification (majburiy)

Push notification ishlashi uchun Firebase native config fayllari bo'lishi shart:

- iOS: `mobile/ios/Logistika/GoogleService-Info.plist`
- Android: `mobile/android/app/google-services.json`

### Qanday qo'yiladi
1. Firebase Console'da iOS va Android app'larni yarating
   - iOS bundle ID: `org.reactjs.native.example.Logistika`
   - Android package: `com.logistikatemp`
2. Shu 2 ta faylni yuklab oling
3. Yuqoridagi pathlarga joylang

Yoki avtomatik namuna nusxalash (keyin haqiqiy fayl bilan almashtiring):
```bash
cd mobile
npm run setup:firebase
# Firebase Console fayllarini joylang, keyin:
npm run check:firebase
```

Repoda **namuna** fayllar bor (haqiqiy credential yo'q):
- `mobile/android/app/google-services.json.example` → nusxalab `google-services.json` qiling
- `mobile/ios/Logistika/GoogleService-Info.plist.example` → nusxalab `GoogleService-Info.plist` qiling

Backend uchun `.env` da `FCM_SERVER_KEY` (yoki Firebase HTTP v1) sozlang.

### iOS qo'shimcha
```bash
cd ios
pod install
cd ..
```

### Android qo'shimcha
`android/build.gradle` va `android/app/build.gradle` da Google Services plugin yoqilgan bo'lishi kerak (bu loyiha ichida allaqachon sozlangan).

### Yakuniy qayta build
```bash
npx react-native start --reset-cache
npx react-native run-ios
# yoki
npx react-native run-android
```

### E2E tekshiruv
Push to'liq ishlashini haqiqiy qurilmada tekshirish uchun: **`PUSH_NOTIFICATION_E2E_CHECKLIST.md`**

Backend `.env`:
```env
FCM_SERVER_KEY=your_firebase_server_key
PUSH_MAX_RETRY_ATTEMPTS=5
PUSH_RETRY_BACKOFF_SECONDS=60
```

## 8. Sentry (production error tracking)

Release build uchun `mobile/src/config/production.ts` da DSN kiriting:
```ts
export const PRODUCTION_SENTRY_DSN = 'https://...@sentry.io/...';
```

- `__DEV__` rejimida Sentry **o'chiriladi** (local ishlab chiqish buzilmaydi)
- DSN bo'sh bo'lsa — hech narsa yuborilmaydi
- Backend bilan bir xil Sentry loyihasidan foydalanish mumkin
