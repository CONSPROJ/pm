-- =====================================================================
--  عکس در گزارش روزانه + پیش‌نمایش کوچک فایل‌ها
--  پیش‌نیاز: storage_s3.sql. یک بار در Supabase ← SQL Editor اجرا شود؛
--  اجرای دوباره بی‌خطر است.
--  • ستون «عکس» برای ردیف‌های پیمانکار (activities) و مشکلات (issues)
--  • لینک‌های امضاشدهٔ چند فایل با یک درخواست (برای پیش‌نمایش‌های کوچک)
-- =====================================================================

do $$ begin
  if to_regprocedure('public._pm_s3_ready(integer)') is null then raise exception 'اول storage_s3.sql را اجرا کنید.'; end if;
end $$;

alter table public.activities add column if not exists photos text;
alter table public.issues     add column if not exists photos text;

create or replace function public.pm_file_urls(p_keys text[], p_slots integer[]) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare out jsonb := '[]'::jsonb; k text; home integer; r1 boolean; r2 boolean; u text; a text;
begin
  if public.pm_me() is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;
  r1 := public._pm_s3_ready(1); r2 := public._pm_s3_ready(2);
  for i in 1 .. least(coalesce(array_length(p_keys, 1), 0), 100) loop
    k := p_keys[i]; u := null; a := null;
    if coalesce(k, '') ~ '^[a-z]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{24}\.[a-z0-9]{1,8}$' then
      home := case when coalesce(p_slots[i], 1) = 2 then 2 else 1 end;
      if (home = 1 and r1) or (home = 2 and r2) then u := public._pm_s3_presign(home, 'GET', k, 600, '{}'::jsonb); end if;
      if (home = 1 and r2) or (home = 2 and r1) then a := public._pm_s3_presign(3 - home, 'GET', k, 600, '{}'::jsonb); end if;
    end if;
    out := out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('u', coalesce(u, a), 'a', case when u is null then null else a end)));
  end loop;
  return jsonb_build_object('ok', true, 'urls', out);
end $$;
grant execute on function public.pm_file_urls(text[], integer[]) to anon, authenticated;

notify pgrst, 'reload schema';

select 'عکس گزارش و پیش‌نمایش فایل‌ها فعال شد ✓' as "نتیجه";
