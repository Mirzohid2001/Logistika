# Logistika Mobile

React Native 0.73 + TypeScript приложение для клиентов, водителей, диспетчеров и операторов.

## Требования и запуск

- Node.js 18+
- Android Studio/JDK для Android
- Xcode и CocoaPods для iOS

```bash
npm ci
npm start
npm run android
# или
npm run ios:pod
npm run ios
```

API URL задаётся конфигурацией в `src/config/appConfig.ts`. Для Android Emulator локальный backend обычно доступен как `http://10.0.2.2:8000`, для iOS Simulator — `http://127.0.0.1:8000`.

## Telegram-вход

Регистрация начинается на экране выбора роли и продолжается в Telegram. Backend открывает официальный OIDC экран в браузере, после успешного входа callback возвращает приложение по deep link:

```text
logistika://auth/telegram?ticket=...
```

Android intent filter и iOS URL scheme уже настроены. OIDC `Client Secret` должен находиться только на backend; в mobile его добавлять нельзя.

Если меняется scheme или callback path, синхронно обновите:

- `src/navigation/linking.ts`
- `android/app/src/main/AndroidManifest.xml`
- iOS URL Types
- `TELEGRAM_AUTH_MOBILE_REDIRECT_URI` на backend

## Основные проверки

```bash
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run audit:prod
npx react-native config
```

`audit:prod` запускает production npm audit. Временное исключение касается только двух опубликованных DoS advisory пакета `image-size`, для которых upstream пока не выпустил исправленную версию; скрипт дополнительно проверяет локальные guards и имеет ограниченный срок действия.

## Структура

```text
src/
├── components/       переиспользуемые UI-компоненты
├── context/          auth и badge contexts
├── navigation/       навигация и deep links
├── screens/          auth/client/driver/dispatcher/updater экраны
├── services/         API, secure storage, push и session services
├── types/            TypeScript модели API
└── utils/            маршруты, tracking и вспомогательная логика
```

Access/refresh tokens сохраняются через secure storage; профиль и несекретные настройки — через AsyncStorage.
