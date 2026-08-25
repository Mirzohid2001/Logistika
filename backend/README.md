# Logistika Backend

Django REST API логистической платформы. Использует PostgreSQL, Redis, Celery, Channels/WebSocket, JWT и Telegram OpenID Connect.

## Локальная установка

Требования: Python 3.11+, PostgreSQL 15+ и Redis 7+.

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
python manage.py migrate
python manage.py runserver
```

Настройки читаются из переменных окружения. Для локальной базы укажите `POSTGRES_*`, для фоновых задач и WebSocket — `REDIS_URL`, `CELERY_BROKER_URL` и `CELERY_RESULT_BACKEND`.

## Telegram-only регистрация

Проект использует официальный Telegram OIDC, поэтому нужен собственный бот:

1. Создайте бота командой `/newbot` в `@BotFather`.
2. В настройках бота откройте **Bot Settings → Web Login**, зарегистрируйте origin/redirect URL публичного HTTPS API и получите OIDC `Client ID` и `Client Secret`.
3. Callback должен в точности совпадать с `TELEGRAM_AUTH_REDIRECT_URI`, например `https://api.example.com/api/auth/telegram/callback/`.
4. Заполните `.env`:

```dotenv
TELEGRAM_ONLY_REGISTRATION=True
TELEGRAM_AUTH_CLIENT_ID=123456789
TELEGRAM_AUTH_CLIENT_SECRET=replace-with-web-login-secret
TELEGRAM_AUTH_REDIRECT_URI=https://api.example.com/api/auth/telegram/callback/
TELEGRAM_AUTH_MOBILE_REDIRECT_URI=logistika://auth/telegram
```

`Client Secret` хранится только на сервере и не включается в мобильное приложение. Обычный bot token для самой авторизации не используется; он понадобится отдельно, только если бот будет отправлять сообщения.

Endpoints:

- `POST /api/auth/telegram/start/` — создаёт state, nonce, PKCE и возвращает authorization URL.
- `GET /api/auth/telegram/callback/` — серверный OIDC callback от Telegram.
- `POST /api/auth/telegram/complete/` — однократно обменивает mobile ticket на JWT и профиль.
- `POST /api/auth/login/` — legacy-вход существующего пользователя по телефону/паролю.
- `POST /api/auth/refresh/`, `GET|PUT /api/auth/me/` — JWT session и профиль.

Для нового аккаунта Telegram должен вернуть подтверждённый узбекский номер `+998`. Existing account связывается по Telegram ID либо подтверждённому номеру. Повторное использование state/ticket и подмена nonce блокируются.

## Безопасность и media

- Документы водителя и транспорта принимаются только как JPEG/PNG/WebP, проверяются по сигнатуре, декодированию, размеру и числу пикселей.
- Имена файлов случайные; private media в S3 выдаются подписанными URL. В production держите `SERVE_LOCAL_MEDIA=False`.
- Точные контакты и маршрут объявления скрыты от анонимных и посторонних пользователей.
- Внешние HTTP-интеграции имеют connect/read timeout. Доверие к `X-Forwarded-For` включается только за прокси, который перезаписывает заголовок.
- `SECRET_KEY`, Telegram secret, payment keys и S3 credentials нельзя коммитить или передавать клиенту.

## API и документация

- Swagger UI: `/api/docs/`
- ReDoc: `/api/redoc/`
- OpenAPI schema: `/api/schema/`
- Liveness: `/health/`
- Readiness (DB + cache): `/ready/`

Публичный список объявлений пагинирован (`page`, `page_size`, максимум 100). Ответ имеет поля `count`, `next`, `previous`, `results`.

## Тесты и проверки

Команды выполняются из каталога `backend/`:

```bash
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate
python manage.py test
python manage.py spectacular --file /tmp/logistika-schema.yml --validate
pip-audit -r requirements.txt
```

Для тестов без production security redirect:

```bash
DJANGO_SETTINGS_MODULE=config.settings_test python manage.py test
```

## Docker

Из корня репозитория:

```bash
cp backend/.env.example backend/.env
docker compose --env-file backend/.env config --quiet
docker compose --env-file backend/.env up --build
```

В production обязательно замените compose development secret, настройте HTTPS/reverse proxy, private object storage, реальные allowed hosts/origins и секреты интеграций.
