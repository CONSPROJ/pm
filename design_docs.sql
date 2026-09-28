-- جدول «اسناد طراحی» برای بخش دفتر فنی
-- یک بار در Supabase اجرا شود: SQL Editor ← New query ← این متن ← Run
-- تا این جدول ساخته نشود، بخش اسناد طراحی خالی می‌ماند و بقیهٔ سایت مثل قبل کار می‌کند.

create table if not exists public.designs (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  date_fa       text,          -- تاریخ ثبت (شمسی)
  project       text,          -- پروژه
  engineer      text,          -- تهیه‌کننده
  title         text,          -- عنوان مدرک
  number        text,          -- شمارهٔ مدرک / نقشه
  discipline    text,          -- رشته: معماری، سازه، تأسیسات مکانیکی، ...
  revision      text,          -- ویرایش
  party         text,          -- طراح / مشاور
  sent_date     text,          -- تاریخ دریافت (شمسی)
  status        text,          -- وضعیت مدرک: در حال بررسی، نیاز به اصلاح، تأیید مشروط، تأیید شده، برای اجرا
  notify        text,          -- وضعیت ابلاغ
  due_date      text,          -- موعد اتمام (شمسی)
  owner         text,          -- مسئول
  link          text,          -- پیوست
  note          text,          -- توضیحات
  send_history  text           -- تاریخچهٔ ارسال
);

-- دسترسی مثل بقیهٔ جدول‌های سایت (کلید anon برای خواندن و نوشتن)
alter table public.designs enable row level security;

drop policy if exists "designs read"   on public.designs;
drop policy if exists "designs insert" on public.designs;
drop policy if exists "designs update" on public.designs;
drop policy if exists "designs delete" on public.designs;

create policy "designs read"   on public.designs for select using (true);
create policy "designs insert" on public.designs for insert with check (true);
create policy "designs update" on public.designs for update using (true) with check (true);
create policy "designs delete" on public.designs for delete using (true);
