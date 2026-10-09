-- =====================================================================
--  امنیت — مرحلهٔ ۱: نشست واقعی روی سرور + قفل توابع مدیریتی
--
--  پیش‌نیاز: security_phase0_fix.sql قبلاً اجرا شده باشد (جدول people_auth).
--  ترتیب درست:
--    ۱) نسخهٔ تازهٔ سایت منتشر شده باشد (توکن نشست را می‌فرستد)
--    ۲) همین فایل را یک بار در Supabase → SQL Editor اجرا کنید
--    ۳) در سایت: مدیریت کاربران ← امنیت و پشتیبان ← «بررسی وضعیت»
--  اجرای دوباره بی‌خطر است. این مرحله هیچ جدولی را نمی‌بندد و سایت را
--  از کار نمی‌اندازد؛ فقط کاربران یک بار دوباره وارد می‌شوند.
--
--  چه چیزی درست می‌شود:
--    • تا امروز تابع‌های «تعیین رمز» و «بازنشانی رمز» را هر کسی، حتی بدون
--      ورود، می‌توانست صدا بزند و رمز هر حسابی (از جمله ادمین) را عوض کند.
--      از این به بعد فقط ادمینِ واردشده با نشست معتبر.
--    • ورود موفق یک «توکن نشست» تصادفی می‌سازد که روی سرور ثبت می‌شود.
--      سایت آن را با هر درخواست می‌فرستد و سرور از روی آن می‌فهمد
--      درخواست واقعاً از طرف چه کسی است (pm_me).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ۱) جدول نشست‌ها؛ کاملاً بسته برای کلید عمومی. فقط هش توکن نگه داشته می‌شود.
create table if not exists public.people_sessions (
  token_hash  text primary key,
  name        text not null,
  epoch       integer not null default 0,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '30 days',
  user_agent  text
);
create index if not exists people_sessions_name on public.people_sessions(name);
alter table public.people_sessions enable row level security;
revoke all on public.people_sessions from anon, authenticated;

-- ۲) کاربرِ این درخواست، از روی توکنِ سرآیند x-pm-token
create or replace function public.pm_me() returns text
language plpgsql stable security definer
set search_path = public, extensions
as $$
declare tok text; h text; s public.people_sessions%rowtype; ep integer; act boolean;
begin
  begin
    tok := coalesce(current_setting('request.headers', true)::json->>'x-pm-token', '');
  exception when others then tok := ''; end;
  if length(tok) < 32 then return null; end if;
  h := encode(extensions.digest(tok, 'sha256'), 'hex');
  select * into s from public.people_sessions where token_hash = h;
  if not found or s.expires_at < now() then return null; end if;
  select session_epoch into ep from public.people_auth where name = s.name;
  if coalesce(ep, 0) <> s.epoch then return null; end if;           -- رمز عوض شده یا «خروج از همه»
  select coalesce(active, true) into act from public.people where name = s.name;
  if act is distinct from true then return null; end if;             -- حساب غیرفعال یا حذف‌شده
  return s.name;
end $$;

create or replace function public.pm_is_admin() returns boolean
language plpgsql stable security definer
set search_path = public
as $$
declare me text := public.pm_me(); lv integer;
begin
  if me is null then return false; end if;
  if me = 'آقای مهدی نعیمی' then return true; end if;               -- ادمین سامانه (همان فهرست داخل سایت)
  select level into lv from public.people where name = me;
  return coalesce(lv, 0) = 1;
end $$;

-- ساخت نشست تازه (داخلی)
create or replace function public._pm_new_session(p_name text) returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare tok text := encode(extensions.gen_random_bytes(32), 'hex'); ep integer; ua text;
begin
  select session_epoch into ep from public.people_auth where name = p_name;
  begin ua := left(coalesce(current_setting('request.headers', true)::json->>'user-agent', ''), 200);
  exception when others then ua := ''; end;
  insert into public.people_sessions(token_hash, name, epoch, user_agent)
  values (encode(extensions.digest(tok, 'sha256'), 'hex'), p_name, coalesce(ep, 0), ua);
  delete from public.people_sessions where expires_at < now();
  return tok;
end $$;
revoke all on function public._pm_new_session(text) from public, anon, authenticated;

-- ۳) ورود: همان قبلی، به‌علاوهٔ توکن نشست.
--    حسابی که باید رمزش را عوض کند (رمز اولیه یا must_change) توکن نمی‌گیرد؛
--    توکن بعد از تغییر رمز داده می‌شود.
drop function if exists public.login_check(text, text);
create function public.login_check(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare r public.people%rowtype; a public.people_auth%rowtype; ok boolean; first boolean; fails integer; must boolean;
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
    must := first or coalesce(r.must_change, false);
    return jsonb_build_object('ok', true, 'first', first, 'must_change', must, 'epoch', a.session_epoch,
      'token', case when must then null else public._pm_new_session(p_name) end);
  end if;
  fails := coalesce(a.fail_count, 0) + 1;
  if fails >= 5 then
    update public.people_auth set fail_count = 0, locked_until = now() + interval '15 minutes' where name = p_name;
    return jsonb_build_object('ok', false, 'first', first, 'reason', 'locked', 'minutes', 15);
  end if;
  update public.people_auth set fail_count = fails where name = p_name;
  return jsonb_build_object('ok', false, 'first', first, 'reason', 'bad', 'left', 5 - fails);
end $$;

-- ۴) تغییر رمز: رمز قبلی لازم است؛ همهٔ نشست‌های دیگر باطل و یک نشست تازه داده می‌شود
drop function if exists public.change_pass(text, text, text);
create function public.change_pass(p_name text, p_old text, p_new text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare a public.people_auth%rowtype;
begin
  if not exists(select 1 from public.people where name = p_name and coalesce(active, true)) then
    return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  a := public._pm_auth_row(p_name);
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if coalesce(p_old, '') = '' then p_old := public._pm_first_hash(); end if;
  if not public._pm_pw_ok(a, p_old) then
    update public.people_auth set fail_count = coalesce(fail_count, 0) + 1 where name = p_name;
    return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if coalesce(p_new, '') = '' or p_new = public._pm_first_hash() or p_new = p_old then
    return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  update public.people_auth
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), password_hash = null,
         pw_changed_at = now(), fail_count = 0, locked_until = null, session_epoch = session_epoch + 1
   where name = p_name;
  update public.people set must_change = false where name = p_name;
  delete from public.people_sessions where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', a.session_epoch + 1, 'token', public._pm_new_session(p_name));
end $$;

-- ۵) تعیین و بازنشانی رمز دیگران: فقط ادمینِ واردشده
drop function if exists public.admin_set_pass(text, text, boolean);
create function public.admin_set_pass(p_name text, p_new text, p_must boolean) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if coalesce(p_new, '') = '' or p_new = public._pm_first_hash() then return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false); end if;
  perform public._pm_auth_row(p_name);
  update public.people_auth
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)), password_hash = null,
         pw_changed_at = now(), fail_count = 0, locked_until = null, session_epoch = session_epoch + 1
   where name = p_name;
  update public.people set must_change = coalesce(p_must, true) where name = p_name;
  delete from public.people_sessions where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

drop function if exists public.admin_reset_pass(text);
create function public.admin_reset_pass(p_name text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false); end if;
  perform public._pm_auth_row(p_name);
  update public.people_auth set pw_bcrypt = null, password_hash = null, fail_count = 0, locked_until = null,
         session_epoch = session_epoch + 1 where name = p_name;
  update public.people set must_change = true where name = p_name;
  delete from public.people_sessions where name = p_name;
  return jsonb_build_object('ok', true);
end $$;

-- ۶) خروج از همهٔ دستگاه‌ها (با رمز)؛ این دستگاه یک نشست تازه می‌گیرد
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
  delete from public.people_sessions where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', a.session_epoch + 1, 'token', public._pm_new_session(p_name));
end $$;

-- ۷) خروج همین دستگاه، و «من کیستم» برای سایت
create or replace function public.pm_logout() returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare tok text;
begin
  begin tok := coalesce(current_setting('request.headers', true)::json->>'x-pm-token', '');
  exception when others then tok := ''; end;
  if length(tok) >= 32 then
    delete from public.people_sessions where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex');
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pm_whoami() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare me text := public.pm_me();
begin
  if me is not null then
    update public.people_sessions set last_seen = now()
     where name = me and last_seen < now() - interval '10 minutes';
  end if;
  return jsonb_build_object('v', 1, 'name', me, 'admin', public.pm_is_admin(),
    'locked', exists(select 1 from pg_policies where schemaname = 'public' and policyname = 'pm logged in'));
end $$;

revoke all on function public.pm_me() from public, anon, authenticated;
revoke all on function public.pm_is_admin() from public, anon, authenticated;
grant execute on function public.pm_me()                              to anon, authenticated;
grant execute on function public.pm_is_admin()                        to anon, authenticated;
grant execute on function public.login_check(text, text)             to anon, authenticated;
grant execute on function public.change_pass(text, text, text)       to anon, authenticated;
grant execute on function public.admin_set_pass(text, text, boolean) to anon, authenticated;
grant execute on function public.admin_reset_pass(text)              to anon, authenticated;
grant execute on function public.logout_all(text, text)              to anon, authenticated;
grant execute on function public.pm_logout()                          to anon, authenticated;
grant execute on function public.pm_whoami()                          to anon, authenticated;

-- ۸) گزارش: حساب‌هایی که هنوز رمز ندارند و با «۰۰۰۰» باز می‌شوند.
--    برای هر کدام از پنل مدیریت یک رمز موقت بگذارید (دکمهٔ «تعیین رمز»).
select p.name as "حساب بدون رمز (با ۰۰۰۰ باز می‌شود)"
  from public.people p left join public.people_auth a on a.name = p.name
 where coalesce(p.active, true)
   and coalesce(a.pw_bcrypt, '') = '' and coalesce(a.password_hash, '') = '';
