#!/usr/bin/env bash
# index.html ساخته‌شده را روی یک سرور موقت با آزمون smoke می‌سنجد
set -e
cd "$(dirname "$0")/../.."
PORT=${PORT:-8799}
python3 -m http.server "$PORT" >/dev/null 2>&1 & SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
sleep 1
node tools/test/smoke.js "http://localhost:$PORT/index.html"
# ۶۰۲: هیچ متنی روی متن دیگر نیفتد (گوشی و دسکتاپ، روشن و تیره)؛ برخورد = توقف انتشار
node tools/test/overlap.js "http://localhost:$PORT/index.html"
