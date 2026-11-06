#!/usr/bin/env bash
# ساخت: src/index.html (منبعِ قابل ویرایش) ← index.html (کوچک‌شده، همان که منتشر می‌شود)
set -e
cd "$(dirname "$0")/.."
[ -d tools/node_modules/terser ] || (cd tools && npm install --silent >/dev/null)
node tools/build.js src/index.html index.html
