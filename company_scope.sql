-- =====================================================================
--  دسترسی شرکتی (۳۵۷): طراح/مشاور/پیمانکار بیرونی فقط دادهٔ شرکت خودش را از سرور می‌گیرد
--  • اتصال حساب به شرکت: lists با kind = 'حساب طرف' و مقدار «نام کاربر¦نام شرکت» (برای هر پروژه جدا؛ فقط ادمین)
--  • صورت وضعیت، قرارداد، نامه: فقط ردیف‌هایی که «طرف» آن همین شرکت است
--  • اسناد طراحی: نقشه‌های خود شرکت + تأییدشده‌های همه + (به انتخاب مدیر برای هر نوع شرکت) در حال بررسی دیگران
--  • صورتجلسه و کارها: فقط آن‌هایی که نام شخص یا شرکتش در آن آمده
--  • گزارش‌های روزانهٔ کارگاه، نیروی کارگری، ماشین‌آلات و مصالح: بسته
--  • ثبت و ویرایش: فقط با طرفِ همان شرکت
--  ادمین و کاربران بی‌اتصال (تیم اصلی) دست نمی‌خورند.
--  پیش‌نیاز: security_phase1..4 (pm_me، pm_is_admin) و project.sql (pm_project). اجرای دوباره بی‌خطر است.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_me()') is null then raise exception 'اول مراحل امنیت (security_phase1..4) را اجرا کنید.'; end if;
  if to_regprocedure('public.pm_project()') is null then raise exception 'اول project.sql را اجرا کنید.'; end if;
end $$;

-- شرکتِ کاربر فعلی در پروژهٔ فعلی (null = تیم اصلی یا ادمین)
create or replace function public.pm_party() returns text
language sql stable security definer
set search_path = public
as $$
  select case when public.pm_is_admin() then null else (
    select nullif(btrim(split_part(value, '¦', 2)), '')
      from public.lists
     where kind = 'حساب طرف'
       and split_part(value, '¦', 1) = public.pm_me()
       and project_id in (coalesce(public.pm_project(), 'p1'), '*')
     limit 1) end
$$;
revoke all on function public.pm_party() from public;
grant execute on function public.pm_party() to anon, authenticated;

-- این مقدار طرف/طراح مال شرکتِ کاربر است؟ (برای تیم اصلی همیشه بله)
create or replace function public.pm_party_ok(p text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.pm_party() is null then true
    else coalesce(p, '') ilike '%' || public.pm_party() || '%'
  end
$$;
revoke all on function public.pm_party_ok(text) from public;
grant execute on function public.pm_party_ok(text) to anon, authenticated;

-- متن ردیف نام شخص یا شرکتش را دارد؟ (صورتجلسه، کار)
create or replace function public.pm_party_txt_ok(t text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case
    when public.pm_party() is null then true
    else coalesce(t, '') ilike '%' || public.pm_party() || '%' or coalesce(t, '') ilike '%' || public.pm_me() || '%'
  end
$$;
revoke all on function public.pm_party_txt_ok(text) from public;
grant execute on function public.pm_party_txt_ok(text) to anon, authenticated;

-- نقشه‌های در حال بررسی شرکت‌های دیگر برای نوع شرکتِ کاربر دیده شود؟ (قانون پروژه coDraft.نوع؛ پیش‌فرض طراح/مشاور و کارفرما بله)
create or replace function public.pm_party_draft_ok() returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare pty text := public.pm_party(); typ text; r text;
begin
  if pty is null then return true; end if;
  begin
    select split_part(value, '¦', 2)::json->>'t' into typ from public.lists
     where kind = 'پیمانکار — تماس' and split_part(value, '¦', 1) = pty limit 1;
  exception when others then typ := null; end;
  if typ is null or typ not in ('cons', 'emp', 'ctr', 'own') then typ := 'cons'; end if;
  begin
    select split_part(value, '¦', 2)::json->'v'->>('coDraft.' || typ) into r from public.lists
     where kind = 'قوانین سامانه' and value like 'cfg¦%' and project_id in (coalesce(public.pm_project(), 'p1'), '*') limit 1;
  exception when others then r := null; end;
  if r is null or r = '' then return typ in ('cons', 'emp'); end if;
  return r in ('1', 'true');
end $$;
revoke all on function public.pm_party_draft_ok() from public;
grant execute on function public.pm_party_draft_ok() to anon, authenticated;

do $$
declare t text;
begin
  -- اسناد با ستون party
  foreach t in array array['statements', 'contracts', 'letters'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_party_ok(party)))', t);
      execute format('drop policy if exists "pm party write" on public.%I', t);
      execute format('create policy "pm party write" on public.%I as restrictive for insert with check ((select public.pm_party_ok(party)))', t);
      execute format('drop policy if exists "pm party upd" on public.%I', t);
      execute format('create policy "pm party upd" on public.%I as restrictive for update using ((select public.pm_party_ok(party))) with check ((select public.pm_party_ok(party)))', t);
      execute format('drop policy if exists "pm party del" on public.%I', t);
      execute format('create policy "pm party del" on public.%I as restrictive for delete using ((select public.pm_party() is null))', t);
    end if;
  end loop;

  -- اسناد طراحی: خود شرکت + تأییدشده‌های همه
  if to_regclass('public.designs') is not null then
    drop policy if exists "pm party scope" on public.designs;
    create policy "pm party scope" on public.designs as restrictive for select
      using ((select public.pm_party_ok(party)) or (select public.pm_party_draft_ok()) or coalesce(status, '') in ('تأیید شده', 'تأیید مشروط', 'برای اجرا'));
    drop policy if exists "pm party write" on public.designs;
    create policy "pm party write" on public.designs as restrictive for insert with check ((select public.pm_party_ok(party)));
    drop policy if exists "pm party upd" on public.designs;
    create policy "pm party upd" on public.designs as restrictive for update using ((select public.pm_party_ok(party))) with check ((select public.pm_party_ok(party)));
    drop policy if exists "pm party del" on public.designs;
    create policy "pm party del" on public.designs as restrictive for delete using ((select public.pm_party() is null));
  end if;

  -- صورتجلسه و کارها: فقط آنچه نام شخص یا شرکتش در آن است
  foreach t in array array['minutes', 'tasks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_party_txt_ok(%I::text)))', t, t);
    end if;
  end loop;

  -- دادهٔ کارگاه: برای کاربر شرکتی بسته
  foreach t in array array['activities', 'issues', 'workers', 'worker_daily', 'worker_changes', 'worker_ot', 'material_move', 'machines'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_party() is null))', t);
    end if;
  end loop;
end $$;

-- اتصال حساب به شرکت فقط با ادمین
drop policy if exists "pm ext link admin" on public.lists;
create policy "pm ext link admin" on public.lists as restrictive for insert
  with check (kind <> 'حساب طرف' or (select public.pm_is_admin()));
drop policy if exists "pm ext link admin del" on public.lists;
create policy "pm ext link admin del" on public.lists as restrictive for delete
  using (kind <> 'حساب طرف' or (select public.pm_is_admin()));

-- بررسی: سیاست‌های ساخته‌شده
select tablename, string_agg(policyname, '، ' order by policyname) as policies
  from pg_policies where schemaname = 'public' and policyname like 'pm party%'
 group by 1 order by 1;
