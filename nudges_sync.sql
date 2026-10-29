-- =====================================================================
--  همگام‌سازی سبک پیام‌ها و تلنگرها (کاهش Egress)
--  ستون updated_at با هر ویرایش (خوانده شدن، ویرایش پیام، واکنش) خودکار
--  به‌روز می‌شود تا برنامه فقط ردیف‌های تازه و تغییرکرده را بگیرد، نه کل
--  فهرست را. یک بار در Supabase ← SQL Editor اجرا شود؛ اجرای دوباره بی‌خطر است.
-- =====================================================================
alter table public.nudges add column if not exists updated_at timestamptz;
update public.nudges set updated_at = created_at where updated_at is null;
alter table public.nudges alter column updated_at set default now();

create or replace function public._pm_touch_updated() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists pm_nudges_touch on public.nudges;
create trigger pm_nudges_touch before update on public.nudges
  for each row execute function public._pm_touch_updated();

create index if not exists nudges_updated_at on public.nudges(updated_at desc);
create index if not exists nudges_created_at on public.nudges(created_at desc);
notify pgrst, 'reload schema';

select 'همگام‌سازی سبک پیام‌ها فعال شد ✓' as "نتیجه";
