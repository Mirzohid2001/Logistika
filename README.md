# Logistika

Мобильная логистическая платформа для рынка грузоперевозок: клиент публикует груз, водитель предлагает цену, стороны оформляют и отслеживают заказ, а диспетчеры и операторы контролируют выполнение.

## Состав проекта

- `backend/` — Django 5 + Django REST Framework, PostgreSQL, Redis, Celery и Django Channels.
- `mobile/` — React Native 0.73 + TypeScript для Android и iOS.
- `docker-compose.yml` — PostgreSQL, Redis, API, Celery worker и Celery Beat.
- `.github/workflows/ci.yml` — миграции, backend-тесты, OpenAPI, TypeScript, ESLint, Jest и production dependency audit.

Основные домены backend: пользователи и компании, объявления, ставки, заказы и маршрутные точки, чат, платежи и подписки, рейтинги, уведомления, диспетчерский и операторский кабинеты.

## Аутентификация

Новые аккаунты регистрируются только через официальный Telegram OIDC. Приложение не принимает Telegram-пароль и не получает доступ к переписке. Для входа используется собственный Telegram-бот проекта, настроенный через BotFather.

Поток регистрации:

1. Пользователь выбирает роль (водитель или клиент) и, для клиента, вводит ИНН.
2. Мобильное приложение получает у API одноразовый Telegram authorization URL.
3. Telegram подтверждает личность и передаёт backend проверенный ID token.
4. Backend проверяет подпись, issuer, audience, nonce, срок действия и подтверждённый номер `+998`.
5. API связывает существующий аккаунт по Telegram ID/номеру либо создаёт новый и возвращает JWT через одноразовый ticket.

Старый вход по телефону и паролю оставлен только для уже существующих аккаунтов. Legacy-регистрация и восстановление пароля отключены при `TELEGRAM_ONLY_REGISTRATION=True`.

## Быстрый запуск backend

```bash
cp backend/.env.example backend/.env
docker compose --env-file backend/.env up --build
```

API будет доступен на `http://localhost:8000`, Swagger — на `http://localhost:8000/api/docs/`, health checks — `/health/` и `/ready/`.

Без Telegram credentials контейнеры запускаются, но Telegram-вход вернёт ошибку конфигурации. Настройка приведена в [backend/README.md](backend/README.md).

## Проверки

```bash
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py test
python manage.py spectacular --file /tmp/logistika-schema.yml --validate

cd ../mobile
npm ci
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run audit:prod
```

Подробности мобильной сборки и deep link: [mobile/README.md](mobile/README.md).
