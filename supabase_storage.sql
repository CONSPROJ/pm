-- فضای ذخیره‌سازی پیوست‌های دفتر فنی (صورت وضعیت، قرارداد، صورتجلسه، نامه، اسناد طراحی)
-- یک بار در Supabase اجرا شود: SQL Editor ← New query ← این متن ← Run
-- تا این اجرا نشود، سایت خودکار از همان آپلود گوگل درایو استفاده می‌کند.

-- ۱) سطل «attachments»؛ عمومی تا نشانی دانلود مستقیم کار کند
--    سقف هر فایل ۵۰ مگابایت (همان عددی که در سایت نوشته شده)
insert into storage.buckets (id, name, public, file_size_limit)
values ('attachments', 'attachments', true, 52428800)
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit;

-- ۲) دسترسی‌ها: خواندن برای همه، آپلود با کلید سایت. حذف و جایگزینی
--    از سایت انجام نمی‌شود (پیوست از سند برداشته می‌شود ولی فایل می‌ماند)،
--    پس برای جلوگیری از پاک شدن تصادفی فایل‌ها سیاستی برایشان نمی‌گذاریم.
drop policy if exists "attachments read"   on storage.objects;
drop policy if exists "attachments upload" on storage.objects;

create policy "attachments read" on storage.objects
  for select using (bucket_id = 'attachments');

create policy "attachments upload" on storage.objects
  for insert with check (bucket_id = 'attachments');
