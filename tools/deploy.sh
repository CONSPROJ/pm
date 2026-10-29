#!/usr/bin/env bash
# انتشار: شمارهٔ ساخت را به‌روز می‌کند، سینتکس اسکریپت اصلی را می‌سنجد، کامیت و پوش می‌کند.
# استفاده: tools/deploy.sh "پیام کامیت"
set -e
cd "$(dirname "$0")/.."
B=$(date -u +%Y%m%d%H%M%S)
sed -i "s/<meta name=\"pm-build\" content=\"[0-9]*\">/<meta name=\"pm-build\" content=\"$B\">/" index.html
echo "$B" > build.txt
T=$(mktemp -d)
awk '/^<script>$/{n++} n==5' index.html | sed '1d' | sed '/^<\/script>/,$d' > "$T/main.js"
node --check "$T/main.js"
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RX5aMx1rV6gr4XpL8Yct62"
BR=$(git branch --show-current)
for i in 1 2 3 4; do git push -q -u origin "$BR" && break; sleep $((2**i)); done
echo "pushed $(git rev-parse --short HEAD) build $B"
