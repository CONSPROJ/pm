-- =====================================================================
--  حساب‌های بیرونی: هر کاربر بیرونی به پروندهٔ خودش وصل می‌شود
--  پیش‌نیاز: مرحلهٔ ۱ تا ۴ امنیت (و project.sql اگر چندپروژه‌ای است). اجرای دوباره بی‌خطر است.
--  • اتصال در lists با kind = 'حساب طرف' و مقدار «نام کاربر¦نام پرونده»؛ فقط ادمین ثبتش می‌کند.
--  • پیمانکارِ وصل‌شده (سطح ۸) فقط صورت وضعیت، قرارداد، نامه و سند طراحیِ همان طرف را می‌خواند.
--  • کاربر بیرونی «پیشنهاد اصلاح» ثبت می‌کند (kind = 'پیشنهاد اصلاح').
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_level()') is null then raise exception 'اول مرحلهٔ ۴ امنیت را اجرا کنید.'; end if;
end $$;

create or replace function public.pm_party() returns text
language sql stable security definer
set search_path = public
as $$
  select nullif(btrim(split_part(value, '¦', 2)), '')
    from public.lists
   where kind = 'حساب طرف' and split_part(value, '¦', 1) = public.pm_me()
   limit 1
$$;
grant execute on function public.pm_party() to anon, authenticated;

create or replace function public.pm_party_ok(p text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.pm_level() is distinct from 8 then true
    when public.pm_party() is null then true
    else coalesce(p, '') ilike '%' || public.pm_party() || '%'
  end
$$;
grant execute on function public.pm_party_ok(text) to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['statements', 'contracts', 'letters', 'designs'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_party_ok(party)))', t);
    end if;
  end loop;
end $$;

drop policy if exists "pm ext link admin" on public.lists;
create policy "pm ext link admin" on public.lists as restrictive for insert
  with check (kind <> 'حساب طرف' or (select public.pm_is_admin()));
drop policy if exists "pm ext link admin del" on public.lists;
create policy "pm ext link admin del" on public.lists as restrictive for delete
  using (kind <> 'حساب طرف' or (select public.pm_is_admin()));

drop policy if exists "pm suggest" on public.lists;
create policy "pm suggest" on public.lists for insert
  with check ((select public.pm_me()) is not null and kind = 'پیشنهاد اصلاح');
