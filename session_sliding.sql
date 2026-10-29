-- =====================================================================
--  نشست کشویی: هر بار استفاده، انقضای نشست همین دستگاه ۶۰ روز جلو می‌رود.
--  پیش‌تر نشست ۳۰ روز بعد از ورود، حتی با استفادهٔ روزانه، منقضی می‌شد.
--  پیش‌نیاز: security_phase1.sql. اجرای دوباره بی‌خطر است.
-- =====================================================================
create or replace function public.pm_whoami() returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare me text := public.pm_me(); tok text;
begin
  if me is not null then
    update public.people_sessions set last_seen = now()
     where name = me and last_seen < now() - interval '10 minutes';
    begin tok := coalesce(current_setting('request.headers', true)::json->>'x-pm-token', ''); exception when others then tok := ''; end;
    if length(tok) >= 32 then
      update public.people_sessions set expires_at = now() + interval '60 days'
       where token_hash = encode(extensions.digest(tok, 'sha256'), 'hex')
         and expires_at < now() + interval '59 days';
    end if;
  end if;
  return jsonb_build_object('v', 1, 'name', me, 'admin', public.pm_is_admin(),
    'locked', exists(select 1 from pg_policies where schemaname = 'public' and policyname = 'pm logged in'));
end $$;
grant execute on function public.pm_whoami() to anon, authenticated;
select 'نشست کشویی فعال شد ✓' as "نتیجه";
