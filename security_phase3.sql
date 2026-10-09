-- =====================================================================
--  امنیت — مرحلهٔ ۳: حذف کامل رمز اولیهٔ «۰۰۰۰»
--  پیش‌نیاز: مرحلهٔ ۱ (و ترجیحاً ۲) اجرا شده باشد. اجرای دوباره بی‌خطر است.
--
--  • حسابی که رمز ندارد دیگر با هیچ رمزی (از جمله ۰۰۰۰) باز نمی‌شود.
--  • ادمین برای کاربر تازه یا «بازنشانی»، یک رمز موقت تصادفی می‌گیرد که
--    فقط همان یک بار به خودش نشان داده می‌شود؛ کاربر بار اول عوضش می‌کند.
--  • کسی که درخواست حساب می‌دهد، همان موقع رمز خودش را می‌گذارد.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_is_admin()') is null then
    raise exception 'اول مرحلهٔ ۱ را اجرا کنید.';
  end if;
end $$;

-- ۱) بدون رمز ثبت‌شده، هیچ رمزی درست نیست
create or replace function public._pm_pw_ok(a public.people_auth, p_hash text) returns boolean
language plpgsql stable
set search_path = public, extensions
as $$
begin
  if coalesce(p_hash, '') = '' then return false; end if;
  if coalesce(a.pw_bcrypt, '') <> '' then return extensions.crypt(p_hash, a.pw_bcrypt) = a.pw_bcrypt; end if;
  if coalesce(a.password_hash, '') <> '' then return a.password_hash = p_hash; end if;
  return false;
end $$;
revoke all on function public._pm_pw_ok(public.people_auth, text) from public, anon, authenticated;

-- ۲) ورود: حساب بی‌رمز پیام روشن می‌گیرد
drop function if exists public.login_check(text, text);
create function public.login_check(p_name text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare r public.people%rowtype; a public.people_auth%rowtype; fails integer; must boolean;
begin
  select * into r from public.people where name = p_name limit 1;
  if not found then return jsonb_build_object('ok', false, 'reason', 'notfound'); end if;
  if r.active = false then return jsonb_build_object('ok', false, 'reason', 'inactive'); end if;
  a := public._pm_auth_row(p_name);
  if a.locked_until is not null and a.locked_until > now() then
    return jsonb_build_object('ok', false, 'reason', 'locked',
      'minutes', ceil(extract(epoch from (a.locked_until - now())) / 60));
  end if;
  if coalesce(a.pw_bcrypt, '') = '' and coalesce(a.password_hash, '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'nopass');
  end if;
  if public._pm_pw_ok(a, p_hash) then
    if coalesce(a.pw_bcrypt, '') = '' then
      update public.people_auth set pw_bcrypt = extensions.crypt(p_hash, extensions.gen_salt('bf', 10)),
             password_hash = null where name = p_name;
    end if;
    update public.people_auth set fail_count = 0, locked_until = null where name = p_name;
    must := coalesce(r.must_change, false);
    return jsonb_build_object('ok', true, 'first', false, 'must_change', must, 'epoch', a.session_epoch,
      'token', case when must then null else public._pm_new_session(p_name) end);
  end if;
  fails := coalesce(a.fail_count, 0) + 1;
  if fails >= 5 then
    update public.people_auth set fail_count = 0, locked_until = now() + interval '15 minutes' where name = p_name;
    return jsonb_build_object('ok', false, 'reason', 'locked', 'minutes', 15);
  end if;
  update public.people_auth set fail_count = fails where name = p_name;
  return jsonb_build_object('ok', false, 'reason', 'bad', 'left', 5 - fails);
end $$;

-- ۳) تغییر رمز فقط با رمز فعلی
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

-- ۴) رمز موقت تصادفی برای کاربر تازه یا بازنشانی (فقط ادمین؛ فقط یک بار نشان داده می‌شود)
drop function if exists public.admin_reset_pass(text);
create function public.admin_reset_pass(p_name text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare tmp text;
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if not exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false); end if;
  tmp := substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4) || '-' || substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 4);
  perform public._pm_auth_row(p_name);
  update public.people_auth
     set pw_bcrypt = extensions.crypt(encode(extensions.digest(tmp, 'sha256'), 'hex'), extensions.gen_salt('bf', 10)),
         password_hash = null, pw_changed_at = now(), fail_count = 0, locked_until = null,
         session_epoch = session_epoch + 1
   where name = p_name;
  update public.people set must_change = true where name = p_name;
  delete from public.people_sessions where name = p_name;
  return jsonb_build_object('ok', true, 'temp', tmp);
end $$;

-- ۵) درخواست حساب، همراه رمزِ خودِ متقاضی (تا تأیید ادمین غیرفعال می‌ماند)
create or replace function public.request_account(p_name text, p_role text, p_hash text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
begin
  p_name := btrim(coalesce(p_name, ''));
  if length(p_name) < 3 or length(p_name) > 60 then return jsonb_build_object('ok', false, 'reason', 'name'); end if;
  if coalesce(p_hash, '') = '' or length(p_hash) <> 64 or p_hash = public._pm_first_hash() then
    return jsonb_build_object('ok', false, 'reason', 'weak'); end if;
  if exists(select 1 from public.people where name = p_name) then return jsonb_build_object('ok', false, 'reason', 'exists'); end if;
  if (select count(*) from public.people where pending is true) >= 30 then
    return jsonb_build_object('ok', false, 'reason', 'busy'); end if;      -- جلوی پر کردن صف با درخواست انبوه
  insert into public.people(name, role, pending, active, must_change)
  values (p_name, nullif(left(coalesce(p_role, ''), 60), ''), true, false, false);
  insert into public.people_auth(name, pw_bcrypt, pw_changed_at)
  values (p_name, extensions.crypt(p_hash, extensions.gen_salt('bf', 10)), now())
  on conflict (name) do update set pw_bcrypt = excluded.pw_bcrypt, password_hash = null, pw_changed_at = now();
  return jsonb_build_object('ok', true);
end $$;

grant execute on function public.login_check(text, text)         to anon, authenticated;
grant execute on function public.change_pass(text, text, text)   to anon, authenticated;
grant execute on function public.admin_reset_pass(text)          to anon, authenticated;
grant execute on function public.request_account(text, text, text) to anon, authenticated;

-- ۶) کسی که هنوز رمز ندارد (بعد از این دیگر وارد نمی‌شود تا ادمین رمز موقت بدهد)
select p.name as "حساب بدون رمز — از پنل «بازنشانی رمز» بزنید"
  from public.people p left join public.people_auth a on a.name = p.name
 where coalesce(p.active, true) and not coalesce(p.pending, false)
   and coalesce(a.pw_bcrypt, '') = '' and coalesce(a.password_hash, '') = '';
