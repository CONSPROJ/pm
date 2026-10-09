-- =====================================================================
--  فضای فایل S3 — اصلی + جایگزین (آروان، لیارا، پارس‌پک یا هر سرویس سازگار با S3)
--  یک بار در Supabase ← SQL Editor اجرا شود. اجرای دوباره بی‌خطر است
--  (نسخهٔ قبلیِ همین فایل را هم بی‌دردسر به‌روز می‌کند).
--  پیش‌نیاز: مرحلهٔ ۱ امنیت (pm_me) — و ترجیحاً مرحلهٔ ۴ (pm_level).
--
--  • دو اتصال: ۱ = فضای اصلی، ۲ = فضای جایگزین (اختیاری).
--    اگر فضای اصلی در دسترس نبود، آپلود به جایگزین می‌رود و دانلود
--    از هر کدام که جواب داد انجام می‌شود.
--  • کلیدهای محرمانه فقط در یک جدول کاملاً بسته روی سرور است؛
--    هیچ‌وقت به مرورگر نمی‌رسد و از سایت هم خوانده نمی‌شود.
--  • برای هر آپلود یک لینک امضاشدهٔ ۱۵ دقیقه‌ای ساخته می‌شود و فایل
--    مستقیم از گوشی به فضای ابری می‌رود.
--  • فایل‌ها خصوصی‌اند: برای دیدن یا دانلود، لینک ۱۰ دقیقه‌ای فقط
--    به کاربرِ واردشده داده می‌شود.
--  • «فقط مشاهده» و «بیرونی» آپلود نمی‌کنند؛ دانلود برای همهٔ واردشده‌ها.
-- =====================================================================

do $$ begin
  if to_regprocedure('public.pm_me()') is null then raise exception 'اول مرحلهٔ ۱ امنیت را اجرا کنید.'; end if;
end $$;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.pm_storage_cfg (
  id          integer primary key default 1,
  endpoint    text,
  region      text,
  bucket      text,
  access_key  text,
  secret_key  text,
  updated_at  timestamptz,
  updated_by  text
);
alter table public.pm_storage_cfg drop constraint if exists pm_storage_cfg_id_check;
alter table public.pm_storage_cfg add constraint pm_storage_cfg_id_check check (id in (1, 2));
alter table public.pm_storage_cfg enable row level security;
revoke all on public.pm_storage_cfg from anon, authenticated;

-- نسخهٔ قبلی (یک اتصال)
drop function if exists public._pm_s3_presign(text, text, integer, jsonb);
drop function if exists public.pm_file_upload_url(text, text);
drop function if exists public.pm_file_url(text, text, boolean);
drop function if exists public.pm_storage_set(text, text, text, text, text);

-- کدگذاری URI مطابق امضای AWS (RFC 3986)
create or replace function public._pm_uri(t text) returns text
language plpgsql immutable
as $$
declare o text := ''; ch text; b bytea;
begin
  for i in 1 .. coalesce(length(t), 0) loop
    ch := substr(t, i, 1);
    if ch ~ '^[A-Za-z0-9_.~-]$' then o := o || ch;
    else
      b := convert_to(ch, 'UTF8');
      for j in 0 .. length(b) - 1 loop
        o := o || '%' || upper(lpad(to_hex(get_byte(b, j)), 2, '0'));
      end loop;
    end if;
  end loop;
  return o;
end $$;

create or replace function public._pm_s3_ready(p_slot integer) returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists(select 1 from public.pm_storage_cfg where id = p_slot
                  and endpoint is not null and bucket is not null and access_key is not null and secret_key is not null);
$$;
revoke all on function public._pm_s3_ready(integer) from public, anon, authenticated;

-- لینک امضاشده (AWS Signature V4، امضا در query string)
create or replace function public._pm_s3_presign(p_slot integer, p_method text, p_key text, p_expires integer, p_extra jsonb)
returns text
language plpgsql security definer
set search_path = public, extensions
as $$
declare c public.pm_storage_cfg%rowtype; host text; t timestamptz := now();
        amzdate text; ds text; scope text; q jsonb; qs text; path text; canon text; sts text; k bytea;
begin
  select * into c from public.pm_storage_cfg where id = p_slot;
  if c.endpoint is null or c.secret_key is null then raise exception 'فضای فایل تنظیم نشده است'; end if;
  host := regexp_replace(regexp_replace(c.endpoint, '^https?://', ''), '/.*$', '');
  amzdate := to_char(t at time zone 'UTC', 'YYYYMMDD"T"HH24MISS"Z"');
  ds := to_char(t at time zone 'UTC', 'YYYYMMDD');
  scope := ds || '/' || c.region || '/s3/aws4_request';
  select '/' || public._pm_uri(c.bucket) || '/' || string_agg(public._pm_uri(x), '/' order by n)
    into path from unnest(string_to_array(p_key, '/')) with ordinality as u(x, n);
  q := jsonb_build_object(
         'X-Amz-Algorithm', 'AWS4-HMAC-SHA256',
         'X-Amz-Credential', c.access_key || '/' || scope,
         'X-Amz-Date', amzdate,
         'X-Amz-Expires', p_expires::text,
         'X-Amz-SignedHeaders', 'host') || coalesce(p_extra, '{}'::jsonb);
  select string_agg(public._pm_uri(key) || '=' || public._pm_uri(value), '&' order by public._pm_uri(key) collate "C")
    into qs from jsonb_each_text(q);
  canon := p_method || E'\n' || path || E'\n' || qs || E'\n' || 'host:' || host || E'\n\n' || 'host' || E'\n' || 'UNSIGNED-PAYLOAD';
  sts := 'AWS4-HMAC-SHA256' || E'\n' || amzdate || E'\n' || scope || E'\n' || encode(digest(canon, 'sha256'), 'hex');
  k := hmac(convert_to(ds, 'UTF8'), convert_to('AWS4' || c.secret_key, 'UTF8'), 'sha256');
  k := hmac(convert_to(c.region, 'UTF8'), k, 'sha256');
  k := hmac(convert_to('s3', 'UTF8'), k, 'sha256');
  k := hmac(convert_to('aws4_request', 'UTF8'), k, 'sha256');
  return 'https://' || host || path || '?' || qs || '&X-Amz-Signature=' || encode(hmac(convert_to(sts, 'UTF8'), k, 'sha256'), 'hex');
end $$;
revoke all on function public._pm_s3_presign(integer, text, text, integer, jsonb) from public, anon, authenticated;

create or replace function public._pm_lv() returns integer
language plpgsql stable security definer
set search_path = public
as $$
declare lv integer;
begin
  if to_regprocedure('public.pm_level()') is null then return case when public.pm_me() is null then null else 3 end; end if;
  execute 'select public.pm_level()' into lv;
  return lv;
end $$;
revoke all on function public._pm_lv() from public, anon, authenticated;

-- لینک آپلود (PUT) برای یک فایل تازه در فضای اصلی (۱) یا جایگزین (۲)
create or replace function public.pm_file_upload_url(p_kind text, p_name text, p_slot integer default 1) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare lv integer := public._pm_lv(); kind text; ext text; key text; slot integer := coalesce(p_slot, 1);
begin
  if lv is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;
  if lv in (4, 6) then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if slot not in (1, 2) or not public._pm_s3_ready(slot) then
    return jsonb_build_object('ok', false, 'reason', 'nocfg', 'slot', slot); end if;
  kind := lower(regexp_replace(coalesce(p_kind, ''), '[^A-Za-z]', '', 'g'));
  if kind = '' then kind := 'other'; end if;
  ext := lower(substring(coalesce(p_name, '') from '\.([A-Za-z0-9]{1,8})$'));
  if ext is null then ext := 'bin'; end if;
  key := kind || '/' || to_char(now(), 'YYYY/MM') || '/' || encode(gen_random_bytes(12), 'hex') || '.' || ext;
  return jsonb_build_object('ok', true, 'slot', slot, 'key', key,
    'url', public._pm_s3_presign(slot, 'PUT', key, 900, '{}'::jsonb));
end $$;

-- لینک ۱۰ دقیقه‌ای برای دیدن یا دانلود: url از فضایی که فایل در آن آپلود شده،
-- alt از فضای دیگر (اگر تنظیم شده باشد) تا اگر اولی جواب نداد از دومی باز شود.
create or replace function public.pm_file_url(p_key text, p_name text, p_download boolean, p_slot integer default 1) returns jsonb
language plpgsql security definer
set search_path = public, extensions
as $$
declare extra jsonb := '{}'::jsonb; home integer := case when p_slot = 2 then 2 else 1 end; other integer;
        u text; a text;
begin
  if public.pm_me() is null then return jsonb_build_object('ok', false, 'reason', 'login'); end if;
  if coalesce(p_key, '') !~ '^[a-z]+/[0-9]{4}/[0-9]{2}/[0-9a-f]{24}\.[a-z0-9]{1,8}$' then
    return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if p_download then
    extra := jsonb_build_object('response-content-disposition',
      'attachment; filename*=UTF-8''''' || public._pm_uri(coalesce(nullif(p_name, ''), 'file')));
  end if;
  other := 3 - home;
  if public._pm_s3_ready(home) then u := public._pm_s3_presign(home, 'GET', p_key, 600, extra); end if;
  if public._pm_s3_ready(other) then a := public._pm_s3_presign(other, 'GET', p_key, 600, extra); end if;
  if u is null and a is null then return jsonb_build_object('ok', false, 'reason', 'nocfg'); end if;
  return jsonb_strip_nulls(jsonb_build_object('ok', true, 'url', coalesce(u, a), 'alt', case when u is null then null else a end));
end $$;

-- تنظیم از پنل مدیریت (فقط ادمین؛ کلید محرمانه هرگز برگردانده نمی‌شود).
-- کلید محرمانهٔ خالی = همان قبلی. نشانی خالی = حذف آن اتصال.
create or replace function public.pm_storage_set(p_slot integer, p_endpoint text, p_region text, p_bucket text, p_access text, p_secret text)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
begin
  if not public.pm_is_admin() then return jsonb_build_object('ok', false, 'reason', 'denied'); end if;
  if p_slot not in (1, 2) then return jsonb_build_object('ok', false, 'reason', 'bad'); end if;
  if nullif(btrim(p_endpoint), '') is null then
    delete from public.pm_storage_cfg where id = p_slot;
    return jsonb_build_object('ok', true, 'removed', true);
  end if;
  insert into public.pm_storage_cfg(id) values (p_slot) on conflict (id) do nothing;
  update public.pm_storage_cfg set
    endpoint   = btrim(p_endpoint),
    region     = coalesce(nullif(btrim(p_region), ''), 'us-east-1'),
    bucket     = nullif(btrim(p_bucket), ''),
    access_key = nullif(btrim(p_access), ''),
    secret_key = coalesce(nullif(btrim(p_secret), ''), secret_key),
    updated_at = now(), updated_by = public.pm_me()
  where id = p_slot;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.pm_storage_info() returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare adm boolean;
begin
  if public.pm_me() is null then return jsonb_build_object('ok', false); end if;
  adm := public.pm_is_admin();
  return jsonb_build_object('ok', true, 'slots', coalesce((
    select jsonb_agg(jsonb_build_object('slot', c.id, 'ready', public._pm_s3_ready(c.id),
             'endpoint', c.endpoint, 'region', c.region, 'bucket', c.bucket,
             'access', case when adm then c.access_key else null end,
             'hasSecret', c.secret_key is not null, 'at', c.updated_at, 'by', c.updated_by) order by c.id)
      from public.pm_storage_cfg c), '[]'::jsonb));
end $$;

grant execute on function public.pm_file_upload_url(text, text, integer) to anon, authenticated;
grant execute on function public.pm_file_url(text, text, boolean, integer) to anon, authenticated;
grant execute on function public.pm_storage_set(integer, text, text, text, text, text) to anon, authenticated;
grant execute on function public.pm_storage_info() to anon, authenticated;

select 'فضای فایل S3 (اصلی + جایگزین) آماده است؛ از پنل «محل آپلود» اتصال‌ها را وارد کنید ✓' as "نتیجه";
