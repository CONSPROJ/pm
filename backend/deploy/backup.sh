#!/bin/sh
# پشتیبان روزانهٔ کامل پایگاه داده (فشرده) با نگه‌داری KEEP_DAYS روز. نسخهٔ بیرون از سرور را هم جدا نگه دارید (DEPLOY.md).
set -eu
while true; do
  f="/backups/pm-$(date -u +%Y%m%d-%H%M).dump"
  if pg_dump -h db -U pm -d pm -Fc -f "$f.tmp"; then mv "$f.tmp" "$f"; echo "backup ok $f"; else rm -f "$f.tmp"; echo "backup FAILED" >&2; fi
  find /backups -name 'pm-*.dump' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
