-- =====================================================================
--  اسناد داخلی تیم (۴۸۸): پیش‌نویس، بازبینی داخلی و تأیید داخلی اسناد طراحی هر تیم بیرونی
--  • ردیف‌های اسناد طراحی با co_space = نام تیم «داخلی» هستند
--  • فقط اعضای همان تیم (و مدیر اصلی سامانه برای رفع اشکال) آن‌ها را می‌بینند؛ تیم پروژه و کارفرما نمی‌بینند
--  • ارسال به پروژه با ترانسمیتال انجام می‌شود و سند پروژه پس از بررسی تیم اصلی ساخته می‌شود
--  پیش‌نیاز: company_scope.sql (pm_party). اجرای دوباره بی‌خطر است.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_party()') is null then raise exception 'اول company_scope.sql را اجرا کنید.'; end if;
end $$;

alter table public.designs add column if not exists co_space text;
alter table public.designs add column if not exists co_log text;
create index if not exists designs_co_space_idx on public.designs (co_space) where co_space is not null;

drop policy if exists "pm co doc read" on public.designs;
create policy "pm co doc read" on public.designs as restrictive for select
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

drop policy if exists "pm co doc ins" on public.designs;
create policy "pm co doc ins" on public.designs as restrictive for insert
  with check (co_space is null or co_space = (select public.pm_party()));

drop policy if exists "pm co doc upd" on public.designs;
create policy "pm co doc upd" on public.designs as restrictive for update
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()))
  with check (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

drop policy if exists "pm co doc del" on public.designs;
create policy "pm co doc del" on public.designs as restrictive for delete
  using (co_space is null or (select public.pm_is_admin()) or co_space = (select public.pm_party()));

select policyname from pg_policies where schemaname = 'public' and tablename = 'designs' and policyname like 'pm co doc%' order by 1;
