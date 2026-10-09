#!/usr/bin/env bash
# پشتیبان شبانه: دیتابیس کامل + فایل‌های پیوست؛ ۱۴ نسخهٔ آخر نگه داشته می‌شود.
# اگر مقصد بیرونی (rclone) تنظیم شده باشد، یک نسخه هم آنجا می‌رود.
set -euo pipefail
BASE=/opt/pm
OUT=/var/backups/pm
KEEP=14
mkdir -p "$OUT"; chmod 700 "$OUT"
TS=$(date +%Y%m%d-%H%M)
DB=$(docker ps --format '{{.Names}}' | grep -E '(^|-)db(-|$)|supabase-db' | head -1)
[ -n "$DB" ] || { echo "ظرف دیتابیس پیدا نشد"; exit 1; }
docker exec "$DB" pg_dump -U postgres -d postgres --format=custom --no-owner > "$OUT/db-$TS.dump"
VOL="$BASE/supabase/volumes/storage"
[ -d "$VOL" ] && tar -C "$VOL" -czf "$OUT/files-$TS.tgz" . || true
ls -1t "$OUT"/db-*.dump 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
ls -1t "$OUT"/files-*.tgz 2>/dev/null | tail -n +$((KEEP+1)) | xargs -r rm -f
if command -v rclone >/dev/null && rclone listremotes | grep -q '^pmbackup:'; then
  rclone copy "$OUT/db-$TS.dump" pmbackup:pm-backups/ && { [ -f "$OUT/files-$TS.tgz" ] && rclone copy "$OUT/files-$TS.tgz" pmbackup:pm-backups/ || true; }
fi
echo "$(date '+%F %T') پشتیبان $TS ساخته شد ($(du -sh "$OUT" | cut -f1) در کل)"
