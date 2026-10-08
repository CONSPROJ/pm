-- رشته و پیش‌نیازهای فعالیت‌ها (برنامهٔ زمان‌بندی)
-- فقط دو ستون تازه به جدول فعالیت‌ها اضافه می‌کند؛ به داده‌ها و دسترسی‌ها دست نمی‌زند.
alter table public.tasks add column if not exists category text;
alter table public.tasks add column if not exists deps jsonb;

-- اگر قبلاً اجرا نکرده‌اید (نوع صورت وضعیت):
alter table public.statements add column if not exists st_type text;

-- بازگشت (در صورت نیاز):
-- alter table public.tasks drop column if exists category;
-- alter table public.tasks drop column if exists deps;
