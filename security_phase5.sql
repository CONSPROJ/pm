-- =====================================================================
--  امنیت — مرحلهٔ ۵: سابقهٔ ورود و خروج
--  پیش‌نیاز: مرحلهٔ ۱ تا ۴. اجرای دوباره بی‌خطر است.
--  ورود موفق، رمز اشتباه، قفل شدن حساب، خروج، تغییر و بازنشانی رمز با
--  دستگاه و IP در همان «سابقهٔ تغییرات» ثبت می‌شود (بخش «ورود و خروج»).
-- =====================================================================

do $$ begin
  if to_regclass('public.audit_log') is null then raise exception 'اول مرحلهٔ ۴ را اجرا کنید.'; end if;
end $$;

create or replace function public._pm_req_info() returns jsonb
language plpgsql stable
as $$
declare h json; ip text; ua text;
begin
  begin h := current_setting('request.headers', true)::json; exception when others then h := null; end;
  if h is null then return '{}'::jsonb; end if;
  ip := split_part(coalesce(h->>'x-forwarded-for', h->>'cf-connecting-ip', h->>'x-real-ip', ''), ',', 1);
  ua := left(coalesce(h->>'user-agent', ''), 200);
  return jsonb_strip_nulls(jsonb_build_object('ip', nullif(btrim(ip), ''), 'ua', nullif(ua, '')));
end $$;

create or replace function public._pm_auth_log(p_who text, p_op text, p_extra jsonb) returns void
language plpgsql security definer
set search_path = public
as $$
declare me text;
begin
  begin me := public.pm_me(); exception when others then me := null; end;
  insert into public.audit_log(who, tbl, op, row_id, data)
  values (p_who, 'auth', p_op, p_who,
          public._pm_req_info() || coalesce(p_extra, '{}'::jsonb)
          || case when me is not null and me <> p_who then jsonb_build_object('by', me) else '{}'::jsonb end);
end $$;
revoke all on function public._pm_auth_log(text, text, jsonb) from public, anon, authenticated;

-- ورود موفق = ساخته شدن نشست؛ خروج = پاک شدن نشستِ هنوز معتبر
create or replace function public._pm_sess_log() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public._pm_auth_log(new.name, 'LOGIN', '{}'::jsonb);
  elsif tg_op = 'DELETE' and old.expires_at > now() then
    perform public._pm_auth_log(old.name, 'LOGOUT', jsonb_build_object('since', old.created_at));
  end if;
  return null;
end $$;
drop trigger if exists pm_sess_log on public.people_sessions;
create trigger pm_sess_log after insert or delete on public.people_sessions
  for each row execute function public._pm_sess_log();

-- رمز اشتباه، قفل شدن، تغییر یا بازنشانی رمز
create or replace function public._pm_pw_log() returns trigger
language plpgsql security definer
set search_path = public
as $$
begin
  if coalesce(new.fail_count, 0) > coalesce(old.fail_count, 0) then
    perform public._pm_auth_log(new.name, 'LOGIN_FAIL', jsonb_build_object('n', new.fail_count));
  end if;
  if new.locked_until is not null and new.locked_until > now()
     and (old.locked_until is null or old.locked_until <= now()) then
    perform public._pm_auth_log(new.name, 'LOCKED', jsonb_build_object('until', new.locked_until));
  end if;
  if new.pw_changed_at is distinct from old.pw_changed_at then
    perform public._pm_auth_log(new.name, 'PASS_CHANGE', '{}'::jsonb);
  elsif coalesce(new.pw_bcrypt, '') = '' and coalesce(old.pw_bcrypt, '') <> '' then
    perform public._pm_auth_log(new.name, 'PASS_RESET', '{}'::jsonb);
  end if;
  return null;
end $$;
drop trigger if exists pm_pw_log on public.people_auth;
create trigger pm_pw_log after update on public.people_auth
  for each row execute function public._pm_pw_log();

-- هر کس سابقهٔ ورود خودش را هم ببیند؛ ادمین همه را
drop policy if exists "pm audit read" on public.audit_log;
create policy "pm audit read" on public.audit_log for select
  using ((select public.pm_is_admin()) or (tbl = 'auth' and who = (select public.pm_me())));

select 'سابقهٔ ورود و خروج فعال شد ✓' as "نتیجه";
