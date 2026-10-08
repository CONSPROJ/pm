-- اسناد طراحی: نوع سند، مبدأ، طبقه، محل کارکرد و تاریخچهٔ کامل ویرایش‌ها
alter table public.designs add column if not exists doc_type text;
alter table public.designs add column if not exists origin text;
alter table public.designs add column if not exists floor text;
alter table public.designs add column if not exists zone text;
alter table public.designs add column if not exists revs jsonb;

-- رشته و پیش‌نیازهای فعالیت‌ها (اگر قبلاً اجرا نکرده‌اید)
alter table public.tasks add column if not exists category text;
alter table public.tasks add column if not exists deps jsonb;

-- نوع صورت وضعیت (اگر قبلاً اجرا نکرده‌اید)
alter table public.statements add column if not exists st_type text;

-- همهٔ دستورها فقط ستون تازه اضافه می‌کنند؛ به داده‌ها و دسترسی‌ها دست نمی‌زنند.
-- بازگشت (در صورت نیاز):
-- alter table public.designs drop column if exists doc_type, drop column if exists origin, drop column if exists floor, drop column if exists zone, drop column if exists revs;
