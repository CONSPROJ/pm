-- ۶۸۴: «نوع کار» هر فعالیت (اجرایی، طراحی و مهندسی، تدارکات و خرید، اداری و قراردادی، مجوز، بازرسی و تحویل، سایر)
-- یک بار در Supabase (SQL Editor) اجرا شود. تکرارِ اجرا بی‌خطر است.
-- تا اجرا نشده، برنامهٔ زمان‌بندی نوع کار را فقط در خودش نگه می‌دارد و سایت مثل قبل حدس می‌زند.
alter table public.tasks add column if not exists work_type text;
create index if not exists tasks_work_type on public.tasks(work_type);
notify pgrst, 'reload schema';
