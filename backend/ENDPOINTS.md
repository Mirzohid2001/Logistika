# API Endpoints Ro'yxati

## 1. Authentication (`/api/auth/`)
- `POST /api/auth/register/` - Ro'yxatdan o'tish
- `POST /api/auth/login/` - Tizimga kirish
- `POST /api/auth/refresh/` - Token yangilash
- `POST /api/auth/send-sms-code/` - SMS kod yuborish
- `POST /api/auth/verify-sms/` - SMS kodni tekshirish
- `GET /api/auth/me/` - Joriy foydalanuvchi ma'lumotlari
- `PUT /api/auth/me/` - Profilni yangilash

## 2. Users (`/api/auth/` va `/api/users/`)
- `POST /api/auth/upload-documents/` - Hujjatlarni yuklash
- `GET /api/users/vehicles/` - Foydalanuvchi transport vositalari
- `GET /api/users/earnings/` - Foydalanuvchi daromadlari (haydovchi uchun)

## 2.1. Admin Panel (`/api/admin/`)
- `GET /api/admin/driver-earnings-statistics/` - Haydovchilar daromadlari statistikasi (admin uchun)
  - Query parametrlar:
    - `date_from` (optional): Boshlanish sanasi (YYYY-MM-DD)
    - `date_to` (optional): Tugash sanasi (YYYY-MM-DD)
    - `driver_id` (optional): Haydovchi ID
    - `export` (optional): Export formati (`csv`)
  - Response: Barcha haydovchilar uchun statistikalar (total_earnings, completed_orders, pending_orders, in_progress_orders)

## 3. Vehicles (`/api/users/vehicles/`)
- `GET /api/users/vehicles/` - Transport vositalar ro'yxati
- `POST /api/users/vehicles/` - Yangi transport vositasini qo'shish
- `GET /api/users/vehicles/{id}/` - Transport vositasini ko'rish
- `PUT /api/users/vehicles/{id}/` - Transport vositasini yangilash
- `DELETE /api/users/vehicles/{id}/` - Transport vositasini o'chirish

## 4. Advertisements (`/api/advertisements/`)
- `GET /api/advertisements/` - E'lonlar ro'yxati (filtrlash bilan)
- `POST /api/advertisements/` - Yangi e'lon yaratish
- `GET /api/advertisements/{id}/` - E'lon ma'lumotlari
- `PUT /api/advertisements/{id}/` - E'lonni yangilash
- `DELETE /api/advertisements/{id}/` - E'lonni o'chirish
- `POST /api/advertisements/{id}/accept/` - E'lonni qabul qilish (haydovchi uchun)
- `GET /api/advertisements/my/` - Mening e'lonlarim

## 5. Bids (`/api/bids/`)
- `POST /api/bids/` - Taklif yaratish
- `POST /api/bids/{id}/accept-price/` - Taklif narxini qabul qilish
- `POST /api/bids/{id}/reject/` - Taklifni rad etish
- `POST /api/bids/{id}/counter-offer/` - Qarama-qarshi taklif berish
- `GET /api/bids/my/` - Mening takliflarim
- `GET /api/bids/advertisement/{advertisement_id}/` - E'lon uchun takliflar ro'yxati

## 6. Orders (`/api/orders/`)
- `GET /api/orders/` - Buyurtmalar ro'yxati
- `GET /api/orders/{id}/` - Buyurtma ma'lumotlari
- `POST /api/orders/{id}/start/` - Buyurtmani boshlash
- `POST /api/orders/{id}/stop/` - Buyurtmani to'xtatish
- `POST /api/orders/{id}/complete/` - Buyurtmani yakunlash
- `POST /api/orders/{id}/reject/` - Buyurtmani rad etish
- `GET /api/orders/{id}/track/` - Buyurtma joylashuvi
- `POST /api/orders/{id}/update-location/` - Joylashuvni yangilash

## 7. Payments (`/api/payments/`)
- `POST /api/payments/create/` - To'lov yaratish
- `GET /api/payments/my/` - Mening to'lovlarim
- `GET /api/payments/{id}/status/` - To'lov holati
- `POST /api/payments/{id}/callback/` - To'lov callback (webhook)
- `GET /api/payments/order/{order_id}/` - Buyurtma uchun to'lovlar

## 8. Locations (`/api/locations/`)
- `GET /api/locations/countries/` - Mamlakatlar ro'yxati
- `GET /api/locations/cities/` - Shaharlar ro'yxati (country_id filter bilan)

## 9. News (`/api/news/`)
- `GET /api/news/` - Yangiliklar ro'yxati
- `GET /api/news/{id}/` - Yangilik ma'lumotlari

## 10. Content (`/api/content/`)
- `GET /api/content/public-offer/` - Ommaviy oferta
- `GET /api/content/disclaimer/` - Disclaimer
- `GET /api/content/guide-clients/` - Mijozlar uchun qo'llanma
- `GET /api/content/guide-drivers/` - Haydovchilar uchun qo'llanma

## 11. Documentation
- `GET /api/schema/` - OpenAPI schema
- `GET /api/docs/` - Swagger UI
- `GET /api/redoc/` - ReDoc

