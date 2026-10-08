-- صورتجلسه: مسئول پیگیری هر بند
alter table public.minutes add column if not exists follower text;

-- اسناد طراحی (اگر قبلاً اجرا نکرده‌اید)
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
-- بازگشت صورتجلسه (در صورت نیاز):
-- alter table public.minutes drop column if exists follower;
