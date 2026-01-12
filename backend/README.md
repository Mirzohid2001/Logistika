# MyGruz Backend

Django REST Framework asosida qurilgan yuk tashish agregatori backend tizimi.

## Talablar

- Python 3.11+
- Django 4.2.7
- Django REST Framework 3.14.0

## O'rnatish

1. Virtual environment yaratish:
```bash
python3 -m venv venv
source venv/bin/activate
```

2. Dependencylarni o'rnatish:
```bash
pip install -r requirements.txt
```

3. Database migrations:
```bash
python manage.py makemigrations
python manage.py migrate
```

4. Superuser yaratish:
```bash
python manage.py createsuperuser
```

5. Serverni ishga tushirish:
```bash
python manage.py runserver
```

## API Endpoints

### Authentication
- `POST /api/auth/register/` - Ro'yxatdan o'tish
- `POST /api/auth/login/` - Kirish
- `POST /api/auth/refresh/` - Token yangilash
- `GET /api/auth/me/` - Joriy foydalanuvchi ma'lumotlari
- `PUT /api/auth/me/` - Profilni yangilash
- `POST /api/auth/send-sms-code/` - SMS kod yuborish
- `POST /api/auth/verify-sms/` - SMS kodni tasdiqlash

### Users
- `GET /api/users/vehicles/` - Transport vositalarini ko'rish
- `POST /api/users/vehicles/` - Transport vositasini qo'shish

### Locations
- `GET /api/locations/countries/` - Mamlakatlar ro'yxati
- `GET /api/locations/cities/` - Shaharlar ro'yxati

### Advertisements
- `GET /api/advertisements/` - E'lonlar ro'yxati
- `POST /api/advertisements/` - Yangi e'lon yaratish
- `GET /api/advertisements/{id}/` - E'lon tafsilotlari
- `PUT /api/advertisements/{id}/` - E'loni yangilash
- `DELETE /api/advertisements/{id}/` - E'loni o'chirish
- `GET /api/advertisements/my/` - Mening e'lonlarim

### Bids
- `POST /api/bids/` - Taklif yuborish
- `POST /api/bids/{id}/accept-price/` - Narxni qabul qilish
- `POST /api/bids/{id}/reject/` - Taklifni rad etish
- `POST /api/bids/{id}/counter-offer/` - Qarama-qarshi taklif
- `GET /api/bids/my/` - Mening takliflarim

### Orders
- `GET /api/orders/` - Buyurtmalar ro'yxati
- `GET /api/orders/{id}/` - Buyurtma tafsilotlari
- `POST /api/orders/{id}/start/` - Buyurtmani boshlash
- `POST /api/orders/{id}/stop/` - Buyurtmani to'xtatish
- `POST /api/orders/{id}/complete/` - Buyurtmani yakunlash
- `POST /api/orders/{id}/reject/` - Buyurtmani rad etish
- `GET /api/orders/{id}/track/` - Buyurtmani kuzatish

### News
- `GET /api/news/` - Yangiliklar ro'yxati
- `GET /api/news/{id}/` - Yangilik tafsilotlari

### Content
- `GET /api/content/public-offer/` - Publik oferta
- `GET /api/content/disclaimer/` - Mas'uliyatdan voz kechish
- `GET /api/content/guide-clients/` - Klientlar uchun qo'llanma
- `GET /api/content/guide-drivers/` - Haydovchilar uchun qo'llanma

### Payments
- `POST /api/payments/create/` - To'lov yaratish
- `GET /api/payments/{id}/status/` - To'lov holatini tekshirish
- `POST /api/payments/{id}/callback/` - Payment gateway callback
- `GET /api/payments/my/` - Mening to'lovlarim
- `GET /api/payments/order/{order_id}/` - Buyurtma bo'yicha to'lovlar

### Users
- `GET /api/users/vehicles/` - Transport vositalarini ko'rish
- `GET /api/users/earnings/` - Daromad statistikasi (Driver uchun)

## Swagger Documentation

API dokumentatsiyasi:
- Swagger UI: `http://localhost:8000/api/docs/`
- ReDoc: `http://localhost:8000/api/redoc/`
- Schema JSON: `http://localhost:8000/api/schema/`

## Environment Variables

`.env` faylida quyidagi o'zgaruvchilarni sozlang:

```
SECRET_KEY=your-secret-key
DEBUG=True
ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000

CLICK_MERCHANT_ID=
CLICK_SERVICE_ID=
CLICK_SECRET_KEY=

PAYME_MERCHANT_ID=
PAYME_KEY=

UZUM_MERCHANT_ID=
UZUM_SECRET_KEY=

ESKIZ_EMAIL=
ESKIZ_PASSWORD=
```

