-- نوع صورت وضعیت (موقت / مستقل / قطعی)
-- فقط یک ستون متنی جدید به جدول صورت وضعیت‌ها اضافه می‌کند؛ به داده‌ها و دسترسی‌ها دست نمی‌زند.
alter table public.statements add column if not exists st_type text;

-- بازگشت (در صورت نیاز):
-- alter table public.statements drop column if exists st_type;
