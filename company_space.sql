-- =====================================================================
--  فضای شرکت (۳۶۱): هر شرکت (طراح/مشاور/پیمانکار) فضای کاری خودش را برای مدیریت تیمش دارد
--  • کارهای فضای شرکت ستون co_space = نام شرکت دارند
--  • فقط اعضای همان شرکت (و مدیر اصلی سامانه برای رفع اشکال) آن‌ها را می‌بینند؛ تیم اصلی پروژه هم نمی‌بیند
--  • هر کس فقط با برچسب شرکت خودش کار فضای شرکت ثبت می‌کند
--  • «مدیر شرکت» را فقط ادمین تعیین می‌کند
--  پیش‌نیاز: company_scope.sql (pm_party). اجرای دوباره بی‌خطر است.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_party()') is null then raise exception 'اول company_scope.sql را اجرا کنید.'; end if;
end $$;

alter table public.tasks add column if not exists co_space text;
create index if not exists tasks_co_space_idx on public.tasks (co_space) where co_space is not null;

drop policy if exists "pm co space read" on public.tasks;
create policy "pm co space read" on public.tasks as restrictive for select
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

drop policy if exists "pm co space write" on public.tasks;
create policy "pm co space write" on public.tasks as restrictive for insert
  with check (co_space is null or co_space = (select public.pm_party()));

drop policy if exists "pm co space upd" on public.tasks;
create policy "pm co space upd" on public.tasks as restrictive for update
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()))
  with check (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

drop policy if exists "pm co space del" on public.tasks;
create policy "pm co space del" on public.tasks as restrictive for delete
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

drop policy if exists "pm co mgr admin" on public.lists;
create policy "pm co mgr admin" on public.lists as restrictive for insert
  with check (kind <> 'مدیر شرکت' or (select public.pm_is_admin()));
drop policy if exists "pm co mgr admin del" on public.lists;
create policy "pm co mgr admin del" on public.lists as restrictive for delete
  using (kind <> 'مدیر شرکت' or (select public.pm_is_admin()));

select policyname from pg_policies where schemaname = 'public' and policyname like 'pm co %' order by 1;
