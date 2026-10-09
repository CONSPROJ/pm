-- =====================================================================
--  عیب‌یابی فضای ابری از سمت سرور (بدون محدودیت مرورگر)
--  پیش‌نیاز: storage_s3.sql. یک بار در Supabase ← SQL Editor اجرا شود.
--  سرور خودش از فضای ابری فهرست فایل‌ها و فایل آزمایشی را می‌خواهد و
--  جواب واقعی را (کد و متن) نشان می‌دهد. فقط ادمین.
-- =====================================================================

create extension if not exists pg_net;

create or replace function public.pm_storage_probe(p_slot integer, p_key text) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare ids jsonb := '{}'::jsonb;
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if p_slot not in (1, 2) or not public._pm_s3_ready(p_slot) then return jsonb_build_object('ok', false, 'reason', 'nocfg'); end if;
  ids := jsonb_build_object(
    'list_path',  net.http_get(public._pm_s3_sign(p_slot, 'GET', '', 300, '{"list-type":"2","max-keys":"5"}'::jsonb, false)),
    'list_vhost', net.http_get(public._pm_s3_sign(p_slot, 'GET', '', 300, '{"list-type":"2","max-keys":"5"}'::jsonb, true)));
  if coalesce(p_key, '') ~ '^[a-z]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{24}\.[a-z0-9]{1,8}$' then
    ids := ids || jsonb_build_object(
      'get_path',  net.http_get(public._pm_s3_sign(p_slot, 'GET', p_key, 300, '{}'::jsonb, false)),
      'get_vhost', net.http_get(public._pm_s3_sign(p_slot, 'GET', p_key, 300, '{}'::jsonb, true)),
      -- همان درخواست با سربرگ‌های مرورگر آیفون (برای دیدن تفاوت رفتار با مرورگر)
      'get_safari', net.http_get(public._pm_s3_sign(p_slot, 'GET', p_key, 300, '{}'::jsonb, false), '{}'::jsonb,
        '{"User-Agent":"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1","Accept":"text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}'::jsonb),
      'get_origin', net.http_get(public._pm_s3_sign(p_slot, 'GET', p_key, 300, '{}'::jsonb, false), '{}'::jsonb,
        '{"Origin":"https://consproj.github.io","Accept":"*/*"}'::jsonb));
  end if;
  return jsonb_build_object('ok', true, 'ids', ids);
end $$;

create or replace function public.pm_storage_probe_result(p_ids jsonb) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare out jsonb := '{}'::jsonb; k text; v text; r record;
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  for k, v in select * from jsonb_each_text(coalesce(p_ids, '{}'::jsonb)) loop
    select status_code, left(regexp_replace(coalesce(content, ''), '\s+', ' ', 'g'), 300) as body, error_msg, timed_out
      into r from net._http_response where id = v::bigint;
    if found then
      out := out || jsonb_build_object(k, jsonb_build_object('st', r.status_code, 'body', r.body, 'err', r.error_msg, 'to', r.timed_out));
    else
      out := out || jsonb_build_object(k, jsonb_build_object('wait', true));
    end if;
  end loop;
  return jsonb_build_object('ok', true, 'res', out);
end $$;

grant execute on function public.pm_storage_probe(integer, text) to anon, authenticated;
grant execute on function public.pm_storage_probe_result(jsonb) to anon, authenticated;

notify pgrst, 'reload schema';

select 'عیب‌یابی فضای ابری آماده است ✓' as "نتیجه";
