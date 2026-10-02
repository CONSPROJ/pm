-- =====================================================================
--  امنیت — مرحلهٔ ۰ : رمزها، قفل حساب، پنهان‌سازی هش، خروج از همهٔ دستگاه‌ها
--  یک بار در Supabase → SQL Editor اجرا کنید. اجرای دوباره بی‌خطر است.
--  ترتیب: اول همین SQL را اجرا کنید، بعد نسخهٔ تازهٔ سایت منتشر شود.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------- ستون‌های تازهٔ جدول کاربران ----------
alter table public.people add column if not exists pw_bcrypt      text;
alter table public.people add column if not exists fail_count     integer not null default 0;
alter table public.people add column if not exists locked_until   timestamptz;
alter table public.people add column if not exists session_epoch  integer not null default 0;
alter table public.people add column if not exists pw_changed_at  timestamptz;

-- ---------- هش رمز ورود ساده (رمز اولیهٔ ۰۰۰۰ برای حساب بی‌رمز) ----------
create or replace function public._pm_first_hash() returns text
language sql immutable as $$
  select encode(extensions.digest('0000', 'sha256'), 'hex')
$$;

-- ---------- بررسی رمز (داخلی) ----------
create or replace function public._pm_pw_match(r public.people, p_hash text) returns boolean
language plpgsql stable
set search_path = public, extensions
as $$
begin
  if coalesce(p_hash, '') = '' then return false; end if;
  if r.pw_bcrypt is not null and r.pw_bcrypt <> '' then
    return extensions.crypt(p_hash, r.pw_bcrypt) = r.pw_bcrypt;
  end if;
  if r.password_hash is not null and r.password_hash <> '' then
    return r.password_hash = p_hash;
  end if;
  return p_hash = public._pm_first_hash();
end $$;

-- ---------- ورود ----------
drop function if exists public.login_check(text, text);
create function public.login_check(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare
  r public.people%rowtype;
  ok boolean;
  first boolean;
  fails integer;
begin
  select * into r from public.people where name = p_name limit 1;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'notfound');
  end if;
  if r.active = false then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'minutes', ceil(extract(epoch from (r.locked_until - now())) / 60));
  end if;

  first := (coalesce(r.pw_bcrypt, '') = '' and coalesce(r.password_hash, '') = '');
  ok := public._pm_pw_match(r, p_hash);

  if ok then
    -- رمز قدیمی (SHA-256 ساده) در همین ورود به bcrypt ارتقا پیدا می‌کند
    if coalesce(r.pw_bcrypt, '') = '' and coalesce(r.password_hash, '') <> '' then
      update public.people
         set pw_bcrypt = extensions.crypt(p_hash, extensions.gen_salt('bf', 10)),
             password_hash = null
       where name = p_name;
    end if;
    update public.people set fail_count = 0, locked_until = null where name = p_name;
    return jsonb_build_object('ok', true, 'first', first,
      'must_change', first or coalesce(r.must_change, false),
      'epoch', coalesce(r.session_epoch, 0));
  end if;

  fails := coalesce(r.fail_count, 0) + 1;
  if fails >= 5 then
    update public.people set fail_count = 0, locked_until = now() + interval '15 minutes' where name = p_name;
    return jsonb_build_object('ok', false, 'first', first, 'reason', 'locked', 'minutes', 15);
  end if;
  update public.people set fail_count = fails where name = p_name;
  return jsonb_build_object('ok', false, 'first', first, 'reason', 'bad', 'left', 5 - fails);
end $$;

-- ---------- تغییر رمز توسط خود کاربر ----------
drop function if exists public.change_pass(text, text, text);
create function public.change_pass(p_name text, p_old text, p_new text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare r public.people%rowtype;
begin
  select * into r from public.people where name = p_name limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  if r.locked_until is not null and r.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  -- حساب بی‌رمز: رمز قبلی همان ۰۰۰۰ است (کلاینت خالی هم می‌فرستد)
  if coalesce(p_old, '') = '' then p_old := public._pm_first_hash(); end if;
  if not public._pm_pw_match(r, p_old) then
    return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if coalesce(p_new, '') = '' or p_new = public._pm_first_hash() then
    return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  update public.people
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
         password_hash = null, must_change = false, pw_changed_at = now(),
         fail_count = 0, locked_until = null,
         session_epoch = coalesce(session_epoch, 0) + 1
   where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', coalesce(r.session_epoch, 0) + 1);
end $$;

-- ---------- تعیین رمز توسط ادمین (رمز موقت) ----------
drop function if exists public.admin_set_pass(text, text, boolean);
create function public.admin_set_pass(p_name text, p_new text, p_must boolean) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  if coalesce(p_new, '') = '' then return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  update public.people
     set pw_bcrypt = extensions.crypt(p_new, extensions.gen_salt('bf', 10)),
         password_hash = null, must_change = coalesce(p_must, true), pw_changed_at = now(),
         fail_count = 0, locked_until = null,
         session_epoch = coalesce(session_epoch, 0) + 1
   where name = p_name;
  return jsonb_build_object('ok', found);
end $$;

-- ---------- بازنشانی رمز توسط ادمین (برگشت به رمز اولیه) ----------
drop function if exists public.admin_reset_pass(text);
create function public.admin_reset_pass(p_name text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  update public.people
     set pw_bcrypt = null, password_hash = null, must_change = true,
         fail_count = 0, locked_until = null,
         session_epoch = coalesce(session_epoch, 0) + 1
   where name = p_name;
  return jsonb_build_object('ok', found);
end $$;

-- ---------- خروج از همهٔ دستگاه‌ها (با تأیید رمز) ----------
drop function if exists public.logout_all(text, text);
create function public.logout_all(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare r public.people%rowtype;
begin
  select * into r from public.people where name = p_name limit 1;
  if not found or not public._pm_pw_match(r, p_hash) then
    return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  update public.people set session_epoch = coalesce(session_epoch, 0) + 1 where name = p_name;
  return jsonb_build_object('ok', true, 'epoch', coalesce(r.session_epoch, 0) + 1);
end $$;

revoke all on function public._pm_pw_match(public.people, text) from public, anon, authenticated;
grant execute on function public.login_check(text, text)          to anon, authenticated;
grant execute on function public.change_pass(text, text, text)    to anon, authenticated;
grant execute on function public.admin_set_pass(text, text, boolean) to anon, authenticated;
grant execute on function public.admin_reset_pass(text)           to anon, authenticated;
grant execute on function public.logout_all(text, text)           to anon, authenticated;

-- ---------- پنهان کردن ستون‌های رمز از کلید عمومی ----------
-- همهٔ ستون‌ها جز رمز و قفل قابل خواندن‌اند؛ session_epoch فقط خواندنی است.
-- اگر بعداً ستونی به people اضافه شد، همین بلوک را دوباره اجرا کنید.
do $$
declare sel text; wr text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into sel
    from information_schema.columns
   where table_schema = 'public' and table_name = 'people'
     and column_name not in ('password_hash', 'pw_bcrypt', 'fail_count', 'locked_until');
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into wr
    from information_schema.columns
   where table_schema = 'public' and table_name = 'people'
     and column_name not in ('password_hash', 'pw_bcrypt', 'fail_count', 'locked_until',
                             'session_epoch', 'pw_changed_at');
  execute 'revoke select, insert, update on public.people from anon, authenticated';
  execute format('grant select (%s) on public.people to anon, authenticated', sel);
  execute format('grant insert (%s) on public.people to anon, authenticated', wr);
  execute format('grant update (%s) on public.people to anon, authenticated', wr);
end $$;

-- بررسی: باید خطای دسترسی بدهد (یعنی هش دیگر بیرون نمی‌آید)
--   set role anon; select password_hash from public.people limit 1; reset role;
