# راهنمای انتقال به هاست اشتراکی cPanel

سایت دو برنامه است که هر کدام جدا روی cPanel اجرا می‌شوند:

| برنامه | پوشه | آدرس | ابزار cPanel |
|---|---|---|---|
| بک‌اند (Django) | `backend/` | `api.example.com` | Setup Python App |
| سایت و پنل (Next.js) | `frontend/` | `example.com` | Setup Node.js App |

مرورگر فقط با `example.com` کار می‌کند. Next.js درخواست‌های `/api` و `/media` را به `api.example.com` می‌فرستد.

در همه‌ی دستورها، `example.com` را با دامنه‌ی واقعی و `USER` را با نام کاربری cPanel عوض کنید.

## پیش‌نیازهای هاست

قبل از خرید، این موارد را از پشتیبانی هاست بپرسید:

- **Setup Python App** با پایتون **۳.۱۰ یا بالاتر** (Django 5.2 با نسخه‌های قدیمی‌تر کار نمی‌کند)
- **Setup Node.js App** با نود **۲۰ یا بالاتر**
- دسترسی **Terminal** یا SSH
- حداقل **۱ گیگ رم** برای هر حساب، چون `npm run build` حافظه‌ی زیادی می‌خواهد. اگر کمتر بود، بخش «اگر بیلد روی سرور شکست خورد» را ببینید.

## مرحله ۱: زیردامنه و SSL

1. در cPanel، بخش **Domains** (یا Subdomains)، زیردامنه‌ی `api.example.com` را بسازید.
2. در **SSL/TLS Status** برای `example.com`، `www.example.com` و `api.example.com` گزینه‌ی **Run AutoSSL** را بزنید.

## مرحله ۲: گرفتن کد از گیت‌هاب

ریپو خصوصی است، پس سرور برای خواندن آن کلید لازم دارد.

1. در **Terminal** این را بزنید:
   ```bash
   ssh-keygen -t ed25519 -f ~/.ssh/github_shiva -N ""
   cat ~/.ssh/github_shiva.pub
   ```
2. متنی را که چاپ می‌شود در گیت‌هاب اضافه کنید: ریپو ← **Settings** ← **Deploy keys** ← **Add deploy key** (گزینه‌ی write را نزنید).
3. این‌ها را بزنید:
   ```bash
   cat >> ~/.ssh/config <<'EOF'
   Host github.com
     IdentityFile ~/.ssh/github_shiva
   EOF
   chmod 600 ~/.ssh/config
   cd ~
   git clone git@github.com:erfanmohammadi1998/ShivaGallery.git shivagallery
   ```

کد در `~/shivagallery` قرار می‌گیرد، **نه** داخل `public_html`.

## مرحله ۳: بک‌اند

1. **Setup Python App** ← **Create Application**:
   - Python version: بالاترین نسخه‌ی موجود (حداقل 3.10)
   - Application root: `shivagallery/backend`
   - Application URL: `api.example.com`
   - Application startup file: `passenger_wsgi.py`
   - Application Entry point: `application`
2. بعد از ساخت، بالای صفحه یک دستور `source .../bin/activate && cd ...` نمایش داده می‌شود. آن را کپی کنید و در Terminal بزنید. بعد:
   ```bash
   pip install -r requirements.txt

   # داده‌ها و عکس‌های فعلی فروشگاه (فقط همین بار اول!)
   cp ../deploy/initial-data/db.sqlite3 db.sqlite3
   cp -r ../deploy/initial-data/media media

   # تنظیمات
   cp ../deploy/backend.env .env
   nano .env        # همه‌ی example.com ها را با دامنه‌ی واقعی عوض کنید

   python manage.py migrate
   python manage.py collectstatic --noinput
   ```
3. در صفحه‌ی Setup Python App دکمه‌ی **Restart** را بزنید.
4. آدرس `https://api.example.com/api/store/` را باز کنید. باید اطلاعات فروشگاه را به صورت JSON نشان دهد.

## مرحله ۴: سایت و پنل

1. در Terminal:
   ```bash
   cp ~/shivagallery/deploy/frontend.env.production ~/shivagallery/frontend/.env.production
   nano ~/shivagallery/frontend/.env.production   # example.com را عوض کنید
   ```
   این فایل **باید قبل از بیلد** آماده باشد، چون آدرس‌ها هنگام بیلد داخل سایت قرار می‌گیرند.
2. **Setup Node.js App** ← **Create Application**:
   - Node.js version: 20 یا بالاتر
   - Application mode: Production
   - Application root: `shivagallery/frontend`
   - Application URL: `example.com`
   - Application startup file: `server.js`
3. دستور `source .../bin/activate && cd ...` بالای صفحه را در Terminal بزنید. بعد:
   ```bash
   npm install --include=dev
   npm run build
   ```
4. دکمه‌ی **Restart** را بزنید و `https://example.com` را باز کنید.

### اگر بیلد روی سرور شکست خورد

اگر بیلد با `Killed` یا خطای کمبود حافظه متوقف شد، آن را روی ویندوز بسازید:

1. روی سیستم خودتان در پوشه‌ی `frontend` فایل `.env.production` را با همان محتوای سرور بسازید و `npm run build` را بزنید.
2. پوشه‌ی `.next` را زیپ کنید و با **File Manager** در `shivagallery/frontend` روی سرور آپلود و از زیپ خارج کنید.
3. روی سرور فقط `npm install --include=dev` را بزنید (بدون build) و بعد Restart.

## مرحله ۵: بررسی نهایی

- ورود به پنل: `https://example.com/panel` با همان نام کاربری و رمزی که روی سیستم خودتان داشتید. برای ساختن یا عوض کردن رمز، در محیط پایتون بک‌اند `python manage.py createsuperuser` یا `python manage.py changepassword <نام>` را بزنید.
- **ورود مشتری با کد پیامکی** تا وقتی ملی‌پیامک تنظیم نشده کار نمی‌کند، چون کدها فقط در لاگ سرور نوشته می‌شوند. بعد از خرید پنل، بخش SMS فایل `backend/.env` را پر کنید، `SMS_BACKEND=melipayamak` بگذارید و Restart بزنید.
- سه سفارش آزمایشی که روی سیستم ثبت شده بود به سرور هم منتقل شده‌اند. اگر لازم نیستند، از پنل حذفشان کنید.

## به‌روزرسانی‌های بعدی

بعد از هر push جدید به گیت‌هاب:

```bash
cd ~/shivagallery && git pull

# بک‌اند (اول دستور activate بک‌اند)
pip install -r requirements.txt
python manage.py migrate
python manage.py collectstatic --noinput
mkdir -p tmp && touch tmp/restart.txt

# سایت (اول دستور activate فرانت)
npm install --include=dev
npm run build
```

بعد از آن، Restart برنامه‌ی Node.js را بزنید.

> **هرگز** پوشه‌ی `deploy/initial-data` را دوباره کپی نکنید. این کار سفارش‌ها، محصولات و عکس‌های واقعی سرور را پاک می‌کند.

## پشتیبان‌گیری

داده‌های واقعی فقط روی سرور هستند و در گیت‌هاب ذخیره نمی‌شوند: `backend/db.sqlite3` و پوشه‌ی `backend/media`. هر هفته از **File Manager** آن‌ها را دانلود کنید، یا در cPanel بخش **Backup** را فعال کنید.
