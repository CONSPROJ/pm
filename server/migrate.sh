#!/usr/bin/env bash
# =====================================================================
#  انتقال همهٔ داده‌ها و فایل‌ها از Supabase فعلی به سرور شخصی
#  روی سرور جدید، بعد از setup.sh اجرا شود:   bash migrate.sh
#  رشتهٔ اتصال دیتابیس قدیم پرسیده می‌شود (روی صفحه نمایش داده نمی‌شود).
#  سایت قدیم دست نمی‌خورد؛ اگر چیزی درست پیش نرفت، همان کار می‌کند.
# =====================================================================
set -euo pipefail
BASE=/opt/pm
ENV="$BASE/supabase/.env"
OLD_URL_DEFAULT="https://paqevdgkufdafskhgnxq.supabase.co"
say(){ printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
[ -f "$ENV" ] || { echo "اول setup.sh را اجرا کنید."; exit 1; }
API_DOMAIN=$(grep '^API_EXTERNAL_URL=' "$ENV" | cut -d= -f2- | sed 's#https://##')
SERVICE=$(grep '^SERVICE_ROLE_KEY=' "$ENV" | cut -d= -f2-)
DB=$(docker ps --format '{{.Names}}' | grep -E 'supabase-db|(^|-)db(-|$)' | head -1)

echo "رشتهٔ اتصال دیتابیس فعلی را بچسبانید."
echo "(Supabase ← Project Settings ← Database ← Connection string ← URI؛ رمز را داخلش بگذارید)"
read -rsp "Connection string: " OLD_DB; echo
read -rp "نشانی پروژهٔ فعلی [$OLD_URL_DEFAULT]: " OLD_URL; OLD_URL=${OLD_URL:-$OLD_URL_DEFAULT}
read -rp "کلید عمومی (anon) پروژهٔ فعلی — همان که در سایت است: " OLD_ANON

WORK=/var/backups/pm/migrate-$(date +%Y%m%d-%H%M); mkdir -p "$WORK"; chmod 700 "$WORK"

say "۱/۵ گرفتن نسخهٔ کامل دیتابیس فعلی"
MAJOR=$(docker run --rm postgres:17 psql "$OLD_DB" -Atc "show server_version_num" | cut -c1-2)
docker run --rm -v "$WORK:/w" "postgres:${MAJOR:-17}" pg_dump "$OLD_DB" \
  --schema=public --no-owner --format=plain --file=/w/public.sql
sed -i '/^SET transaction_timeout/d' "$WORK/public.sql"
echo "حجم: $(du -h "$WORK/public.sql" | cut -f1)"

say "۲/۵ بازگردانی روی دیتابیس جدید"
N=$(docker exec "$DB" psql -U postgres -d postgres -Atc "select count(*) from pg_tables where schemaname='public'")
if [ "$N" != "0" ]; then
  read -rp "دیتابیس جدید $N جدول دارد. پاک و از نو؟ (yes/no): " A
  [ "$A" = yes ] || { echo "متوقف شد."; exit 1; }
  docker exec "$DB" psql -U postgres -d postgres -c "drop schema public cascade; create schema public; grant usage on schema public to anon, authenticated, service_role;"
fi
docker exec -i "$DB" psql -U postgres -d postgres -v ON_ERROR_STOP=0 -q < "$WORK/public.sql" > "$WORK/restore.log" 2>&1 || true
grep -c "ERROR" "$WORK/restore.log" | xargs -I{} echo "خطاهای بازگردانی: {} (جزئیات در $WORK/restore.log)"
docker exec "$DB" psql -U postgres -d postgres -Atc "select string_agg(tablename||':'||(xpath('/row/c/text()', query_to_xml('select count(*) as c from public.'||quote_ident(tablename), false, true, '')))[1]::text, '  ') from pg_tables where schemaname='public'"

say "۳/۵ سطل فایل‌ها"
docker exec -i "$DB" psql -U postgres -d postgres -q < "$BASE/site/supabase_storage.sql"

say "۴/۵ کپی فایل‌های پیوست"
python3 - "$OLD_URL" "$OLD_ANON" "http://localhost:8000" "$SERVICE" <<'PY'
import json, sys, urllib.request, urllib.parse
old, oldkey, new, svc = sys.argv[1:5]
B = 'attachments'
def req(url, key, data=None, method='GET', ctype='application/json'):
    r = urllib.request.Request(url, data=data, method=method, headers={'apikey': key, 'Authorization': 'Bearer ' + key, 'Content-Type': ctype})
    return urllib.request.urlopen(r, timeout=120)
def walk(prefix=''):
    off = 0
    while True:
        body = json.dumps({'prefix': prefix, 'limit': 1000, 'offset': off}).encode()
        items = json.load(req(f'{old}/storage/v1/object/list/{B}', oldkey, body, 'POST'))
        for it in items:
            p = (prefix + '/' if prefix else '') + it['name']
            if it.get('id') is None: yield from walk(p)
            else: yield p, (it.get('metadata') or {}).get('mimetype') or 'application/octet-stream'
        if len(items) < 1000: break
        off += 1000
ok = bad = 0
for path, mt in walk():
    try:
        data = urllib.request.urlopen(f'{old}/storage/v1/object/public/{B}/{urllib.parse.quote(path)}', timeout=300).read()
        r = urllib.request.Request(f'{new}/storage/v1/object/{B}/{urllib.parse.quote(path)}', data=data, method='POST',
            headers={'apikey': svc, 'Authorization': 'Bearer ' + svc, 'Content-Type': mt, 'x-upsert': 'true'})
        urllib.request.urlopen(r, timeout=300); ok += 1
    except Exception as e:
        bad += 1; print('  ناموفق:', path, e)
print(f'فایل‌ها: {ok} کپی شد، {bad} ناموفق')
PY

say "۵/۵ اصلاح نشانی پیوست‌ها در داده‌ها"
OLD_HOST=$(echo "$OLD_URL" | sed 's#https://##')
docker exec -i "$DB" psql -U postgres -d postgres -q <<SQL
do \$\$
declare r record; n bigint; total bigint := 0;
begin
  for r in select table_name, column_name, data_type from information_schema.columns
            where table_schema = 'public' and data_type in ('text', 'jsonb', 'json', 'character varying') loop
    execute format('update public.%I set %I = replace(%I::text, %L, %L)::%s where %I::text like %L',
      r.table_name, r.column_name, r.column_name, '$OLD_HOST', '$API_DOMAIN',
      case when r.data_type = 'character varying' then 'text' else r.data_type end, r.column_name, '%$OLD_HOST%');
    get diagnostics n = row_count; total := total + n;
  end loop;
  raise notice 'ردیف‌های اصلاح‌شده: %', total;
end \$\$;
SQL

cat <<DONE

=====================================================================
 انتقال تمام شد ✓   (نسخهٔ دیتابیس قدیم در $WORK)
 حالا فقط کلید عمومی سرور جدید (ANON_KEY در $ENV) را به سازندهٔ سایت
 بدهید تا سایت به https://$API_DOMAIN وصل شود.
 تا آن لحظه سایت فعلی روی Supabase قدیم کار می‌کند.
=====================================================================
DONE
