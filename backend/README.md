# سرور اختصاصی سامانهٔ پروژه (backend)

NestJS (Fastify) · TypeScript · PostgreSQL. همهٔ دسترسی‌ها، قوانین و منطق کسب‌وکار در سرور است؛ مرورگر فقط نمایش می‌دهد.

## ساختار
| پوشه | کار |
|---|---|
| `db/migrations/` | تغییرات پایگاه داده، نسخه‌دار و ترتیبی (هر فایل یک بار اجرا می‌شود) |
| `src/authz/` | موتور دسترسی: فرد ← گروه/سمت/طرف ← نوع طرف ← سطح ← پیش‌فرض؛ منع بر اجازه مقدم؛ محدودیت (رشته، نوع سند، فقط طرف خود) |
| `src/auth/` | ورود، نشست (فقط هش توکن ذخیره می‌شود)، گارد سراسری که اجازهٔ هر مسیر را در سرور بررسی می‌کند |
| `src/access/` | مرکز دسترسی ادمین: کاتالوگ اجازه‌ها، ماتریس، اعطا/منع، «این نفر از کجا این اجازه را دارد» |
| `src/settings/` | قوانین قابل تغییر (تعریف + مقدار سامانه + مقدار پروژه)، با کنترل نوع مقدار |
| `src/projects/` | پروژه، طرف‌ها (کارفرما، مشاور، تیم طراحی، …)، چارت سازمانی، عضویت‌ها، گروه‌ها |
| `src/documents/` | کنترل مدارک: رشته‌ها، انواع سند، گردش‌کار قابل تعریف، ویرایش‌ها و رویدادها، زمان‌سنجی هر مرحله و اصلاح، ترنسمیتال، MDR |
| `src/audit/` | گزارش کار همهٔ تغییرها در سرور |
| `test/` | آزمون سرتاسری روی Postgres واقعی |

## اجرا (توسعه)
```bash
npm ci
DATABASE_URL=postgres://... npm run migrate
DATABASE_URL=postgres://... BOOT_USER=... BOOT_PASSWORD=... npx ts-node src/db/bootstrap.ts
DATABASE_URL=postgres://... npm run dev
```
آزمون‌ها: `TEST_DATABASE_URL=postgres://... npm test` (پایگاه دادهٔ آزمون پاک و از نو ساخته می‌شود).

## استقرار
راهنمای کامل و امن: [DEPLOY.md](DEPLOY.md). خلاصه:

## روی سرور
`.env` روی خود سرور (نه در مخزن): `DB_PASSWORD`، `CORS_ORIGINS` (دامنهٔ سایت). سپس `docker compose up -d`؛ migrationها خودکار اجرا می‌شوند.
کاربر صفر یک بار با `bootstrap` ساخته می‌شود؛ رمزش فقط از متغیر محیطی خوانده می‌شود.

## API (نسخهٔ ۱، پیشوند `/api/v1`)
- `POST /auth/login` · `POST /auth/activate` (لینک یک‌بارمصرف) · `POST /auth/password` · `GET /auth/me` · `POST /auth/logout`
- لینک فعال‌سازی عضو: `POST /projects/:pid/members/:id/invite`
- CRS: `GET|POST /projects/:pid/documents/:id/comments` · `POST /projects/:pid/documents/:id/comments/:cid` (reply/close/reopen)
- `GET|POST /projects` · `GET|PATCH /projects/:pid`
- طرف‌ها، سمت‌ها، اعضا، گروه‌ها: `/projects/:pid/{parties,positions,members,groups}`
- دسترسی: `/projects/:pid/access/{me,catalog,matrix,grants,explain}`
- قوانین: `/projects/:pid/settings[/:key]`
- مدارک: `/projects/:pid/{doc-config,disciplines,workflows,doc-types,documents,documents/:id,documents/:id/revisions,documents/:id/transition,transmittals,mdr}`
- گزارش کار: `/projects/:pid/audit`
