-- =====================================================================
--  رفع فوری — بعد از مرحلهٔ ۰ امنیت
--  مشکل: بستن ستون‌های رمز در جدول people باعث شد هر کوئری «select *»
--  روی این جدول (از جمله تابع‌های بارگذاری داده) خطای دسترسی بدهد.
--  راه درست: رمزها به یک جدول جدا و کاملاً بسته منتقل می‌شوند و
--  جدول people دوباره مثل قبل کامل در دسترس برنامه قرار می‌گیرد.
--  یک بار در Supabase → SQL Editor اجرا کنید. اجرای دوباره بی‌خطر است.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ۱) فوری: دسترسی کامل جدول people برگردد (سایت دوباره کار می‌کند)
grant select, insert, update, delete on public.people to anon, authenticated;

-- ۲) جدول جدا و بسته برای رمزها
create table if not exists public.people_auth (
  name           text primary key,
  pw_bcrypt      text,
  password_hash  text,            -- رمز قدیمی (SHA-256)؛ در اولین ورود به bcrypt تبدیل می‌شود
  fail_count     integer not null default 0,
  locked_until   timestamptz,
  session_epoch  integer not null default 0,
  pw_changed_at  timestamptz
);
alter table public.people_auth enable row level security;   -- بدون هیچ policy: برای کلید عمومی کاملاً بسته
revoke all on public.people_auth from anon, authenticated;

-- ۳) انتقال رمزهای موجود از people به people_auth (فقط اگر هنوز منتقل نشده)
do $$
declare has_col boolean;
begin
  select exists(select 1 from information_schema.columns
                 where table_schema='public' and table_name='people' and column_name='password_hash') into has_col;
  if has_col then
    execute $q$
      insert into public.people_auth (name, pw_bcrypt, password_hash, fail_count, locked_until, session_epoch, pw_changed_at)
      select p.name,
             nullif(to_jsonb(p)->>'pw_bcrypt',''),
             nullif(p.password_hash,''),
             coalesce((to_jsonb(p)->>'fail_count')::int, 0),
             (to_jsonb(p)->>'locked_until')::timestamptz,
             coalesce((to_jsonb(p)->>'session_epoch')::int, 0),
             (to_jsonb(p)->>'pw_changed_at')::timestamptz
        from public.people p
      on conflict (name) do update set
             pw_bcrypt     = coalesce(public.people_auth.pw_bcrypt, excluded.pw_bcrypt),
             password_hash = coalesce(public.people_auth.password_hash, excluded.password_hash),
             session_epoch = greatest(public.people_auth.session_epoch, excluded.session_epoch)
    $q$;
  end if;
end $$;

-- ۴) پاک کردن ستون‌های رمز از people (دیگر هیچ هشی در جدول عمومی نمی‌ماند)
alter table public.people drop column if exists password_hash;
alter table public.people drop column if exists pw_bcrypt;
alter table public.people drop column if exists fail_count;
alter table public.people drop column if exists locked_until;
alter table public.people drop column if exists pw_changed_at;
alter table public.people drop column if exists session_epoch;

-- ۵) توابع، این بار روی people_auth
drop function if exists public._pm_pw_match(public.people, text);
create or replace function public._pm_first_hash() returns text
language sql immutable as $$ select encode(extensions.digest('0000', 'sha256'), 'hex') $$;

create or replace function public._pm_auth_row(p_name text) returns public.people_auth
language plpgsql security definer
set search_path = public, extensions
as $$
declare a public.people_auth%rowtype;
begin
  select * into a from public.people_auth where name = p_name;
  if not found then
    insert into public.people_auth(name) values (p_name) on conflict do nothing;
    select * into a from public.people_auth where name = p_name;
  end if;
  return a;
end $$;

create or replace function public._pm_pw_ok(a public.people_auth, p_hash text) returns boolean
language plpgsql stable
set search_path = public, extensions
as $$
begin
  if coalesce(p_hash, '') = '' then return false; end if;
  if coalesce(a.pw_bcrypt, '') <> '' then return extensions.crypt(p_hash, a.pw_bcrypt) = a.pw_bcrypt; end if;
  if coalesce(a.password_hash, '') <> '' then return a.password_hash = p_hash; end if;
  return p_hash = public._pm_first_hash();
end $$;

drop function if exists public.login_check(text, text);
create function public.login_check(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare r public.people%rowtype; a public.people_auth%rowtype; ok boolean; first boolean; fails integer;
begin
  select * into r from public.people where name = p_name limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  if r.active = false then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  a := public._pm_auth_row(p_name);
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'minutes', ceil(extract(epoch from (a.locked_until - now())) / 60));
  end if;
  first := (coalesce(a.pw_bcrypt, '') = '' and coalesce(a.password_hash, '') = '');
  ok := public._pm_pw_ok(a, p_hash);
  if ok then
    if coalesce(a.pw_bcrypt, '') = '' and coalesce(a.password_hash, '') <> '' then
      update public.people_auth set pw_bcrypt = extensions.crypt(p_hash, extensions.gen_salt('bf', 10)),
             password_hash = null where name = p_name;
    end if;
    update public.people_auth set fail_count = 0, locked_until = null where name = p_name;
    return jsonb_build_object('ok', true, 'first', first,
      'must_change', first or coalesce(r.must_change, false), 'epoch', a.session_epoch);
  end if;
  fails := coalesce(a.fail_count, 0) + 1;
  if fails >= 5 then
    update public.people_auth set fail_count = 0, locked_until = now() + interval '15 minutes' where name = p_name;
    return jsonb_build_object('ok', false, 'first', first, 'reason', 'locked', 'minutes', 15);
  end if;
  update public.people_auth set fail_count = fails where name = p_name;
  return jsonb_build_object('ok', false, 'first', first, 'reason', 'bad', 'left', 5 - fails);
end $$;

drop function if exists public.change_pass(text, text, text);
create function public.change_pass(p_name text, p_old text, p_new text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare a public.people_auth%rowtype;
begin
  if not exists(select 1 from public.people where name = p_name) then
    return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  a := public._pm_auth_row(p_name);
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if coalesce(p_old, '') = '' then p_old := public._pm_first_hash(); end if;
  if not public._pm_pw_ok(a, p_old) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if coalesce(p_new, '') = '' or p_new = public._pm_first_hash() then
    return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  update public.people_auth
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), password_hash = null,
         pw_changed_at = now(), fail_count = 0, locked_until = null, session_epoch = session_epoch + 1
   where name = p_name;
  update public.people set must_change = false where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', a.session_epoch + 1);
end $$;

drop function if exists public.admin_set_pass(text, text, boolean);
create function public.admin_set_pass(p_name text, p_new text, p_must boolean) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if coalesce(p_new, '') = '' then return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false); end if;
  perform public._pm_auth_row(p_name);
  update public.people_auth
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), password_hash = null,
         pw_changed_at = now(), fail_count = 0, locked_until = null, session_epoch = session_epoch + 1
   where name = p_name;
  update public.people set must_change = coalesce(p_must, true) where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.admin_reset_pass(text);
create function public.admin_reset_pass(p_name text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false); end if;
  perform public._pm_auth_row(p_name);
  update public.people_auth set pw_bcrypt = null, password_hash = null, fail_count = 0, locked_until = null,
         session_epoch = session_epoch + 1 where name = p_name;
  update public.people set must_change = true where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.logout_all(text, text);
create function public.logout_all(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare a public.people_auth%rowtype;
begin
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  a := public._pm_auth_row(p_name);
  if not public._pm_pw_ok(a, p_hash) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  update public.people_auth set session_epoch = session_epoch + 1 where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', a.session_epoch + 1);
end $$;

-- شمارهٔ نشست (برای خارج شدن خودکار دستگاه‌های دیگر)؛ فقط عدد، نه رمز
drop function if exists public.session_epoch(text);
create function public.session_epoch(p_name text) returns jsonb
language sql stable security definer
set search_path = public
as $$ select jsonb_build_object('epoch', coalesce((select session_epoch from public.people_auth where name = p_name), 0)) $$;

revoke all on function public._pm_auth_row(text) from public, anon, authenticated;
revoke all on function public._pm_pw_ok(public.people_auth, text) from public, anon, authenticated;
grant execute on function public.login_check(text, text)             to anon, authenticated;
grant execute on function public.change_pass(text, text, text)       to anon, authenticated;
grant execute on function public.admin_set_pass(text, text, boolean) to anon, authenticated;
grant execute on function public.admin_reset_pass(text)              to anon, authenticated;
grant execute on function public.logout_all(text, text)              to anon, authenticated;
grant execute on function public.session_epoch(text)                 to anon, authenticated;

-- بررسی (باید خطای دسترسی بدهد):
--   set role anon; select * from public.people_auth limit 1; reset role;
-- و این باید بدون خطا جواب بدهد:
--   set role anon; select * from public.people limit 1; reset role;
