#!/usr/bin/env bash
# کپی شبانهٔ فایل‌ها بین «فضای اصلی» و «فضای جایگزین» تا هر فایل همیشه دو نسخه داشته باشد.
# اتصال‌ها از همان تنظیم پنل «محل آپلود» (جدول pm_storage_cfg) خوانده می‌شود؛
# کلیدها جایی روی دیسک نوشته نمی‌شوند. فقط کپی می‌شود و هیچ فایلی پاک نمی‌شود.
#   روی سرور خودمان: خودکار، هر شب ۳:۳۰ (setup.sh)
#   از هر لینوکس دیگر:  PM_DB_URL='postgresql://…' bash storage_sync.sh
set -euo pipefail
command -v rclone >/dev/null || { echo "rclone نصب نیست: apt install rclone"; exit 1; }
Q="select id, endpoint, coalesce(region,'us-east-1'), bucket, access_key, secret_key from public.pm_storage_cfg
   where endpoint is not null and bucket is not null and access_key is not null and secret_key is not null order by id"
if [ -n "${PM_DB_URL:-}" ]; then
  ROWS=$(psql "$PM_DB_URL" -AtF $'\t' -c "$Q")
else
  DB=$(docker ps --format '{{.Names}}' | grep -E '(^|-)db(-|$)|supabase-db' | head -1)
  [ -n "$DB" ] || { echo "ظرف دیتابیس پیدا نشد (یا PM_DB_URL را بدهید)"; exit 1; }
  ROWS=$(docker exec "$DB" psql -U postgres -d postgres -AtF $'\t' -c "$Q")
fi
declare -A B
while IFS=$'\t' read -r id ep rg bk ak sk; do
  [ -n "$id" ] || continue
  R="RCLONE_CONFIG_PM${id}"
  export "${R}_TYPE=s3" "${R}_PROVIDER=Other" "${R}_ENDPOINT=$ep" "${R}_REGION=$rg" \
         "${R}_ACCESS_KEY_ID=$ak" "${R}_SECRET_ACCESS_KEY=$sk" "${R}_FORCE_PATH_STYLE=true" "${R}_NO_CHECK_BUCKET=true"
  B[$id]=$bk
done <<< "$ROWS"
if [ -z "${B[1]:-}" ] || [ -z "${B[2]:-}" ]; then
  echo "$(date '+%F %T') هر دو فضا (اصلی و جایگزین) تنظیم نشده‌اند؛ کاری انجام نشد."; exit 0
fi
OPTS=(--exclude 'test/**' --transfers 8 --checkers 16 --retries 3 --low-level-retries 10 --stats-one-line --stats 0 -q)
rclone copy "pm1:${B[1]}" "pm2:${B[2]}" "${OPTS[@]}"   # اصلی ← جایگزین
rclone copy "pm2:${B[2]}" "pm1:${B[1]}" "${OPTS[@]}"   # فایل‌هایی که هنگام قطعی اصلی به جایگزین رفتند
echo "$(date '+%F %T') دو فضا هم‌سان شدند: $(rclone size "pm1:${B[1]}" --exclude 'test/**' 2>/dev/null | tr '\n' ' ')"
