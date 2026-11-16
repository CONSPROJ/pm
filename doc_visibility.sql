-- =====================================================================
--  دید اسناد تیم‌های بیرونی (۴۵۵): ماتریس «دید اسناد» در مدیریت سامانه
--  قانون پروژه docVis.<statement|contract|letter|minute|design>.<cons|emp|ctr|own> = all | own | none
--  پیش‌فرض own = همان رفتار company_scope.sql. تیم اصلی و ادمین دست نمی‌خورند. ثبت و ویرایش عوض نمی‌شود.
--  پیش‌نیاز: company_scope.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================
do $$ begin
  if to_regprocedure('public.pm_party()') is null then raise exception 'اول company_scope.sql را اجرا کنید.'; end if;
end $$;

create or replace function public.pm_party_type() returns text
language plpgsql stable security definer
set search_path = public
as $$
declare pty text := public.pm_party(); typ text;
begin
  if pty is null then return null; end if;
  begin
    select split_part(value, '¦', 2)::json->>'t' into typ from public.lists
     where kind = 'پیمانکار — تماس' and split_part(value, '¦', 1) = pty limit 1;
  exception when others then typ := null; end;
  if typ is null or typ not in ('cons', 'emp', 'ctr', 'own') then typ := 'cons'; end if;
  return typ;
end $$;
revoke all on function public.pm_party_type() from public;
grant execute on function public.pm_party_type() to anon, authenticated;

create or replace function public.pm_doc_vis(k text) returns text
language plpgsql stable security definer
set search_path = public
as $$
declare typ text; r text;
begin
  if public.pm_party() is null then return 'all'; end if;
  typ := public.pm_party_type();
  begin
    select split_part(value, '¦', 2)::json->'v'->>('docVis.' || k || '.' || typ) into r from public.lists
     where kind = 'قوانین سامانه' and value like 'cfg¦%' and project_id in (coalesce(public.pm_project(), 'p1'), '*') limit 1;
  exception when others then r := null; end;
  if r in ('all', 'own', 'none') then return r; end if;
  return 'own';
end $$;
revoke all on function public.pm_doc_vis(text) from public;
grant execute on function public.pm_doc_vis(text) to anon, authenticated;

do $$
declare t text; k text;
begin
  foreach t in array array['statements', 'contracts', 'letters'] loop
    if to_regclass('public.' || t) is not null then
      k := left(t, length(t) - 1);
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using (case (select public.pm_doc_vis(%L)) when ''all'' then true when ''none'' then false else (select public.pm_party_ok(party)) end)', t, k);
    end if;
  end loop;

  if to_regclass('public.designs') is not null then
    drop policy if exists "pm party scope" on public.designs;
    create policy "pm party scope" on public.designs as restrictive for select
      using (case (select public.pm_doc_vis('design')) when 'all' then true when 'none' then false
             else ((select public.pm_party_ok(party)) or (select public.pm_party_draft_ok()) or coalesce(status, '') in ('تأیید شده', 'تأیید مشروط', 'برای اجرا')) end);
  end if;

  if to_regclass('public.minutes') is not null then
    drop policy if exists "pm party scope" on public.minutes;
    create policy "pm party scope" on public.minutes as restrictive for select
      using (case (select public.pm_doc_vis('minute')) when 'all' then true when 'none' then false else (select public.pm_party_txt_ok(minutes::text)) end);
  end if;
end $$;

select tablename, policyname from pg_policies where schemaname = 'public' and policyname = 'pm party scope' order by tablename;

-- ===== ۴۶۳: اشتراک یک سند با تیم (lists «اشتراک سند»: «نوع:شناسه¦{"to":["تیم",…],…}») =====
create or replace function public.pm_doc_shared(k text, rid text) returns boolean
language sql stable security definer
set search_path = public
as $$
  select case when public.pm_party() is null then true else exists (
    select 1 from public.lists
     where kind = 'اشتراک سند'
       and value like k || ':' || rid || '¦%'
       and project_id in (coalesce(public.pm_project(), 'p1'), '*')
       and value ilike '%"' || public.pm_party() || '"%') end
$$;
revoke all on function public.pm_doc_shared(text, text) from public;
grant execute on function public.pm_doc_shared(text, text) to anon, authenticated;

do $$
declare t text; k text;
begin
  foreach t in array array['statements', 'contracts', 'letters'] loop
    if to_regclass('public.' || t) is not null then
      k := left(t, length(t) - 1);
      execute format('drop policy if exists "pm party scope" on public.%I', t);
      execute format('create policy "pm party scope" on public.%I as restrictive for select using ((select public.pm_doc_shared(%L, id::text)) or case (select public.pm_doc_vis(%L)) when ''all'' then true when ''none'' then false else (select public.pm_party_ok(party)) end)', t, k, k);
    end if;
  end loop;

  if to_regclass('public.designs') is not null then
    drop policy if exists "pm party scope" on public.designs;
    create policy "pm party scope" on public.designs as restrictive for select
      using ((select public.pm_doc_shared('design', id::text)) or case (select public.pm_doc_vis('design')) when 'all' then true when 'none' then false
             else ((select public.pm_party_ok(party)) or (select public.pm_party_draft_ok()) or coalesce(status, '') in ('تأیید شده', 'تأیید مشروط', 'برای اجرا')) end);
  end if;

  if to_regclass('public.minutes') is not null then
    drop policy if exists "pm party scope" on public.minutes;
    create policy "pm party scope" on public.minutes as restrictive for select
      using ((select public.pm_doc_shared('minute', id::text)) or case (select public.pm_doc_vis('minute')) when 'all' then true when 'none' then false else (select public.pm_party_txt_ok(minutes::text)) end);
  end if;
end $$;

select tablename, policyname from pg_policies where schemaname = 'public' and policyname = 'pm party scope' order by tablename;
