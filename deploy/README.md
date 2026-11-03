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

ریپو خصوصی است، پس سرور برای خواندن آن یک توکن گیت‌هاب لازم دارد.

1. در گیت‌هاب: https://github.com/settings/personal-access-tokens/new
   - Repository access: **Only select repositories** و ریپوی `ShivaaGallery`
   - Permissions ← **Add permissions** ← **Contents** با دسترسی **Read-only**
2. در **Terminal** (همه در یک خط، چون ترمینال مرورگری خط‌های جدا را گاهی به هم می‌چسباند؛ `TOKEN` را با توکن عوض کنید):
   ```bash
   cd ~ && git clone https://alirezaalamshah:TOKEN@github.com/alirezaalamshah/ShivaaGallery.git shivagallery && ls shivagallery; history -c; history -w
   ```
   توکن داخل `.git/config` همان پوشه می‌ماند، پس `git pull`‌های بعدی بدون توکن کار می‌کنند. برای عوض کردن توکن: `git remote set-url origin https://alirezaalamshah:NEW_TOKEN@github.com/alirezaalamshah/ShivaaGallery.git`

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
   # cPanel هنگام ساخت برنامه passenger_wsgi.py را با الگوی خودش عوض می‌کند و آن الگو در خودش گیر می‌کند (RecursionError)
   git checkout -- passenger_wsgi.py

   pip install -r requirements.txt

   # داده‌ها و عکس‌های فعلی فروشگاه (فقط همین بار اول!)
   cp ../deploy/initial-data/db.sqlite3 db.sqlite3
   cp -r ../deploy/initial-data/media media

   # تنظیمات
   sed 's/example\.com/shivaagallery.ir/g' ../deploy/backend.env > .env
   # SMS_USERNAME، SMS_API_KEY و ZARINPAL_MERCHANT_ID را بعداً از فایل API_key.txt روی کامپیوترتان در .env بنویسید

   python manage.py migrate
   python manage.py collectstatic --noinput
   ```
3. در صفحه‌ی Setup Python App دکمه‌ی **Restart** را بزنید (یا در Terminal: `touch tmp/restart.txt`). اگر خطای ۵۰۰ داد، متن خطا در `backend/stderr.log` است.
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
   git checkout -- server.js   # اگر cPanel آن را با الگوی خودش عوض کرده باشد
   npm install --include=dev
   npm run build:server
   ```
   روی هاست اشتراکی `npm run build` (با Turbopack) کار نمی‌کند: هاست تعداد پردازش‌های هر حساب را محدود کرده و `node_modules` یک میان‌بر به بیرون پروژه است. `build:server` با Webpack و فقط یک پردازش می‌سازد.
4. دکمه‌ی **Restart** را بزنید و `https://example.com` را باز کنید.

### اگر بیلد روی سرور شکست خورد

اگر بیلد با `Killed` یا خطای کمبود حافظه متوقف شد، آن را روی ویندوز بسازید:

1. روی سیستم خودتان در پوشه‌ی `frontend` فایل `.env.production` را با همان محتوای سرور بسازید و `npm run build` را بزنید.
2. پوشه‌ی `.next` را زیپ کنید و با **File Manager** در `shivagallery/frontend` روی سرور آپلود و از زیپ خارج کنید.
3. روی سرور فقط `npm install --include=dev` را بزنید (بدون build) و بعد Restart.

## مرحله ۵: بررسی نهایی

- ورود به پنل: `https://example.com/panel` با همان نام کاربری و رمزی که روی سیستم خودتان داشتید. برای ساختن یا عوض کردن رمز، در محیط پایتون بک‌اند `python manage.py createsuperuser` یا `python manage.py changepassword <نام>` را بزنید.
- **ورود مشتری با کد پیامکی** تا وقتی `SMS_BACKEND=melipayamak` نشده کار نمی‌کند، چون کدها فقط در لاگ سرور نوشته می‌شوند. مرحله‌ی ۷ را ببینید.
- داده‌ی اولیه (۱۲ آبان ۱۴۰۵) بدون هیچ سفارش یا فروش آزمایشی است و موجودی همه‌ی رنگ‌ها و سایزها ۱۰ است.
- **موجودی واقعی را وارد کنید.** موجودی بین مغازه و سایت مشترک است و فعلاً همه‌جا ۱۰ گذاشته شده. هر محصول را باز کنید و تعداد واقعی هر رنگ و سایز را بنویسید. از این به بعد هر فروش در مغازه را در **پنل ← صندوق فروش حضوری** ثبت کنید.
- **حساب کاربران پنل.** در **پنل ← کاربران و دسترسی** برای هر فروشنده یا کارمند نام کاربری و رمز بسازید و دسترسی‌هایش را تیک بزنید (قالب «فروشنده» فقط صندوق را باز می‌کند). کاربر از همان `https://example.com/panel/login` وارد می‌شود و فقط بخش‌هایی را که اجازه دارد می‌بیند. سقف تخفیفی که فروشنده می‌تواند بدهد در **تنظیمات فروشگاه ← صندوق فروش حضوری** است.

## مرحله ۶: لغو خودکار سفارش‌های پرداخت‌نشده (Cron Job)

سفارشی که در مهلتش پرداخت نشود، باید لغو شود تا کالایش دوباره در سایت فروخته شود. سایت این کار را هنگام بازدیدها هم انجام می‌دهد، ولی برای اطمینان:

1. در cPanel بخش **Cron Jobs** را باز کنید.
2. Common Settings را روی **Once Per Five Minutes** بگذارید.
3. در Command، مسیر پایتون همان دستور `source .../bin/activate` مرحله‌ی ۳ را بگذارید (به‌جای `activate` بنویسید `python`):
   ```bash
   cd ~/shivagallery/backend && ~/virtualenv/shivagallery/backend/3.11/bin/python manage.py expire_orders
   ```
   عدد `3.11` را با نسخه‌ی پایتونی که انتخاب کرده‌اید عوض کنید.

## مرحله ۷: پیامک، درگاه پرداخت و اینماد

### ملی‌پیامک

هر هفت پترن پیامک تأیید شده‌اند و کدهایشان از قبل در `backend/.env` هست (متن‌ها: `deploy/sms-patterns.md`).

در `backend/.env` روی سرور نام کاربری پنل ملی‌پیامک را جلوی `SMS_USERNAME` و کلید API را از فایل `API_key.txt` جلوی `SMS_API_KEY` بنویسید، `SMS_BACKEND=melipayamak` بگذارید و Restart بزنید.

شماره‌های پرسنل که خبر سفارش جدید و مرجوعی جدید را می‌گیرند در **پنل ← تنظیمات فروشگاه ← سفارش‌ها** تنظیم می‌شوند. چند شماره را با ویرگول جدا کنید. برای این فروشگاه: `09166446200`.

### زرین‌پال

1. در پنل زرین‌پال، دامنه‌ی درگاه را دقیقاً `example.com` ثبت کنید. اگر دامنه فرق کند، زرین‌پال خطای ۱۴- می‌دهد.
2. بعد از این‌که زرین‌پال درگاه را **تأیید** کرد، در `backend/.env`:
   ```
   SITE_URL=https://example.com
   PAYMENT_GATEWAY=zarinpal
   ZARINPAL_MERCHANT_ID=کد ۳۶ حرفی مرچنت از API_key.txt
   ZARINPAL_SANDBOX=false
   ```
   تا قبل از تأیید، `PAYMENT_GATEWAY=none` بماند. در این حالت سفارش ثبت می‌شود و فروشگاه برای پرداخت با مشتری تماس می‌گیرد.
   برای آزمایش بدون پول واقعی، اول `ZARINPAL_SANDBOX=true` بگذارید (در حالت آزمایشی هر کد UUID دلخواهی به‌جای مرچنت کار می‌کند).
3. Restart بک‌اند. از این به بعد دکمه‌ی تسویه‌حساب «پرداخت» می‌شود و مشتری به درگاه می‌رود.

نکته‌ها:
- سایت هر پرداخت را خودش تأیید (verify) می‌کند. اگر مشتری بعد از تمام شدن مهلت (پیش‌فرض ۲۰ دقیقه) پرداخت کند، سفارش قبلاً لغو شده و پرداخت تأیید نمی‌شود. در این حالت بانک پول را به مشتری برمی‌گرداند و به خود مشتری هم همین گفته می‌شود.
- هر پرداخت با کد پیگیری بانک در صفحه‌ی سفارش در پنل نمایش داده می‌شود.

### اینماد

از کد نمادی که اینماد می‌دهد، دو مقدار `id` (برای این فروشگاه `8422971`) و `Code` (`2ox9fcuJoGcIcrvwIEkR9oiDwsh6YZnP`) را در **پنل ← تنظیمات فروشگاه ← قوانین، حریم خصوصی و اینماد** بنویسید. نماد در پایین همه‌ی صفحه‌ها نمایش داده می‌شود. صفحه‌های «درباره‌ی ما»، «تماس با ما»، «قوانین و مقررات» و «حریم خصوصی» که اینماد می‌خواهد، آماده‌اند.

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
npm run build:server
```

بعد از آن، Restart برنامه‌ی Node.js را بزنید.

> **هرگز** پوشه‌ی `deploy/initial-data` را دوباره کپی نکنید. این کار سفارش‌ها، محصولات و عکس‌های واقعی سرور را پاک می‌کند.

## پشتیبان‌گیری

داده‌های واقعی فقط روی سرور هستند و در گیت‌هاب ذخیره نمی‌شوند: `backend/db.sqlite3` و پوشه‌ی `backend/media`. دستور `manage.py backup` از آن‌ها یک فایل زیپ در `~/shivagallery/backups` می‌سازد و نسخه‌های قدیمی را پاک می‌کند.

در **Cron Jobs** دو کار اضافه کنید (مسیر پایتون مثل مرحله‌ی ۶):

1. هر روز (Common Settings: **Once Per Day**)، فقط دیتابیس، ۱۴ نسخه‌ی آخر می‌ماند:
   ```bash
   cd ~/shivagallery/backend && ~/virtualenv/shivagallery/backend/3.11/bin/python manage.py backup
   ```
2. هر هفته (Common Settings: **Once Per Week**)، دیتابیس و عکس‌ها، ۴ نسخه‌ی آخر می‌ماند:
   ```bash
   cd ~/shivagallery/backend && ~/virtualenv/shivagallery/backend/3.11/bin/python manage.py backup --media --keep 4
   ```

این نسخه‌ها روی همان سرور هستند. اگر خود هاست از دست برود، آن‌ها هم از دست می‌روند. پس ماهی یک بار آخرین فایل `full-...zip` را از **File Manager** دانلود کنید.

برای برگرداندن یک نسخه: برنامه‌ی پایتون را Stop کنید، `db.sqlite3` داخل زیپ را جای `backend/db.sqlite3` بگذارید (و اگر لازم است پوشه‌ی `media`) و دوباره Start کنید.
