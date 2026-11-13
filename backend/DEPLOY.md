# راهنمای استقرار امن سرور

هدف: هر انتشار آزموده، برگشت‌پذیر و بدون از دست رفتن داده باشد.

## ۰) پیش از هر انتشار (خودکار)
GitHub Actions (`.github/workflows/backend.yml`) روی هر تغییر این‌ها را اجرا می‌کند و اگر یکی رد شود، انتشار ممنوع است:
بررسی نوع TypeScript · همهٔ آزمون‌های سرتاسری روی Postgres واقعی · ممیزی امنیتی وابستگی‌ها (`npm audit`) · ساخت ایمیج Docker.

## ۱) آماده‌سازی سرور (یک بار)
- Ubuntu 24.04، کاربر غیر root با sudo؛ ورود SSH **فقط با کلید** (`PasswordAuthentication no`، `PermitRootLogin no`).
- دیوار آتش: فقط ۲۲، ۸۰، ۴۴۳ (`ufw default deny incoming; ufw allow 22,80,443/tcp; ufw enable`).
- به‌روزرسانی امنیتی خودکار: `unattended-upgrades`. محافظ SSH: `fail2ban`.
- Docker Engine و Compose از مخزن رسمی Docker.
- دامنه: یک رکورد A برای `API_DOMAIN` به IP سرور.

## ۲) نصب اول
```bash
git clone <مخزن> /opt/pm && cd /opt/pm/backend
cp deploy/env.example .env && chmod 600 .env     # مقدارها را روی خود سرور پر کنید
docker compose build api && docker compose up -d
docker compose ps                                  # همه healthy
```
ساختن کاربر صفر (رمز فقط روی سرور وارد می‌شود، در چت یا مخزن نه):
```bash
read -s BOOT_PASSWORD && export BOOT_PASSWORD
docker compose run --rm -e BOOT_USER=<نام کاربری> -e BOOT_NAME="<نام نمایشی>" -e BOOT_PASSWORD api node dist/db/bootstrap.js
unset BOOT_PASSWORD
```

## ۳) انتشار نسخهٔ تازه (برگشت‌پذیر)
```bash
cd /opt/pm && git pull
cd backend && docker compose exec backup sh -c 'pg_dump -h db -U pm -d pm -Fc -f /backups/pre-deploy-$(date -u +%Y%m%d-%H%M).dump'
TAG=$(git rev-parse --short HEAD)
docker build -t pm-backend:$TAG . && API_TAG=$TAG docker compose up -d api
docker compose ps api                               # باید healthy شود؛ migrationها پیش از بالا آمدن اجرا می‌شوند
```
**برگشت** به نسخهٔ قبل: `API_TAG=<تگ قبلی> docker compose up -d api` (ایمیج‌های قبلی روی سرور می‌مانند).

## ۴) قانون migration (برای برگشت‌پذیری)
- هر migration فقط «اضافه» کند (جدول، ستون nullable، ایندکس). حذف یا تغییر نام ستون در **انتشار بعدی**، وقتی کد قدیمی دیگر به آن نیاز ندارد.
- هرگز فایل migration منتشرشده را ویرایش نکنید؛ تغییر تازه = فایل تازه.
- migration در یک تراکنش اجرا می‌شود؛ اگر خطا بدهد، چیزی نیمه‌کاره نمی‌ماند و نسخهٔ تازه بالا نمی‌آید.

## ۵) پشتیبان و بازیابی
- سرویس `backup` هر روز پشتیبان کامل می‌گیرد و `BACKUP_KEEP_DAYS` روز نگه می‌دارد (`./backups`).
- **رونوشت بیرون از سرور الزامی است** (مثلاً هر شب `rclone` یا `rsync` به فضای ذخیرهٔ دیگر). پشتیبانی که فقط روی همان سرور است، پشتیبان نیست.
- تمرین بازیابی هر ماه روی پایگاه دادهٔ جدا:
```bash
docker compose exec db createdb -U pm restore_test
docker compose exec -T db pg_restore -U pm -d restore_test < backups/<فایل>.dump
```

## ۶) امنیت در لایهٔ برنامه (پیاده‌شده)
- همهٔ دسترسی‌ها در سرور؛ محدودیت رشته/نوع سند/طرف در خود کوئری.
- رمزها با bcrypt؛ فقط هش توکن نشست و لینک فعال‌سازی ذخیره می‌شود؛ لینک فعال‌سازی یک‌بارمصرف و تاریخ‌دار.
- قفل حساب پس از ورودهای ناموفق، محدودیت تعداد درخواست برای هر IP، پاسخ یکسان برای «کاربر نیست» و «رمز غلط».
- سرآیندهای امنیتی (CSP سخت‌گیر، HSTS، nosniff)، CORS فقط دامنهٔ سایت با https.
- پایگاه داده در شبکهٔ داخلی بدون پورت بیرونی؛ کانتینر API فقط‌خواندنی و بدون امتیاز اضافه.
- خطاها بدون جزئیات داخلی به کاربر؛ جزئیات فقط در لاگ سرور؛ سرآیند Authorization در لاگ حذف می‌شود.
- تنظیمات محیطی در شروع بررسی می‌شود؛ مقدار نادرست = سرور بالا نمی‌آید.

## ۷) نگهداری
- لاگ‌ها: `docker compose logs -f api`؛ دسترسی‌ها: `caddy_data/access.log`.
- تغییر رمز پایگاه داده: مقدار `.env` را عوض کنید، با `ALTER USER pm PASSWORD ...` هماهنگ کنید، `docker compose up -d`.
- هر ماه: `npm audit` (در CI خودکار)، به‌روزرسانی ایمیج‌های پایه، تمرین بازیابی.
