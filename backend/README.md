# بک‌اند (Django + DRF)

API فروشگاه و پنل موقت مدیریت جنگو. همه‌ی اطلاعات مخصوص فروشگاه (اسم، لوگو، رنگ‌ها، قوانین مرجوعی) در مدل `StoreSettings` است، نه در کد.

## راه‌اندازی (ویندوز)

```powershell
cd backend
python -m venv .venv
.venv\Scripts\pip install -r requirements.txt
copy .env.example .env
.venv\Scripts\python manage.py migrate
.venv\Scripts\python manage.py seed_demo        # داده‌ی نمونه (اختیاری)
.venv\Scripts\python manage.py createsuperuser
.venv\Scripts\python manage.py runserver
```

روی لینوکس به جای `.venv\Scripts\` از `.venv/bin/` استفاده کنید.

- API: http://127.0.0.1:8000/api/
- پنل جنگو: http://127.0.0.1:8000/admin/

تست‌ها: `.venv\Scripts\python manage.py test`

## اپ‌ها

| اپ | کار |
|---|---|
| `core` | تنظیمات فروشگاه (یک ردیف)، اعتبارسنج‌های مشترک |
| `catalog` | رنگ، سایزبندی و سایز، دسته‌ی درختی با جدول سایز، محصول، تصویر، تنوع (رنگ × سایز) |
| `inventory` | دفتر موجودی فقط‌افزودنی؛ موجودی فقط با `move_stock` تغییر می‌کند |

## API عمومی

| مسیر | توضیح |
|---|---|
| `GET /api/store/` | تنظیمات و برند فروشگاه |
| `GET /api/categories/` | درخت دسته‌ها با تعداد محصول هر شاخه |
| `GET /api/facets/` | رنگ‌ها و سایزها برای فیلتر |
| `GET /api/products/` | فهرست محصولات |
| `GET /api/products/<slug>/` | جزئیات محصول با تنوع‌ها، سایزها، جدول سایز و مسیر دسته |

فیلترهای فهرست محصولات: `category` (نامک، شامل زیردسته‌ها)، `color` و `size` (شناسه‌ها با کاما؛ فقط تنوع‌های موجود)، `min_price`، `max_price` (بر اساس قیمت حراج اگر باشد)، `in_stock`، `on_sale`، `featured`، `search`، `ordering` (`current`، `-current`، `-created_at`)، `page`.

## تصمیم‌های مهم

- **موجودی:** `Variant.stock` جمع دفتر موجودی است. `move_stock` ردیف تنوع را قفل می‌کند تا دو خرید هم‌زمان آخرین کالا را دو بار نفروشند، و اجازه‌ی منفی شدن نمی‌دهد. دیتابیس هم با یک constraint جلوی موجودی منفی را می‌گیرد.
- **قیمت:** به تومان و عدد صحیح. قیمت حراج اختیاری است و باید از قیمت اصلی کمتر باشد. هر تنوع می‌تواند قیمت جدا داشته باشد.
- **سایزبندی و جدول سایز** روی دسته تعریف می‌شوند و زیردسته‌ها به ارث می‌برند.
- **نامک فارسی:** آدرس محصولات فارسی و خواناست (`/products/مانتو-کتان-بلند-نسیم/`).
- **دیتابیس:** SQLite برای توسعه؛ برای سرور `DB_ENGINE=postgresql` و درایور `psycopg` را نصب کنید.
