#!/usr/bin/env bash
# انتشار: شمارهٔ ساخت را به‌روز می‌کند، سینتکس اسکریپت اصلی را می‌سنجد، کامیت و پوش می‌کند.
# استفاده: tools/deploy.sh "پیام کامیت"
set -e
# منبع برنامه src/index.html است؛ index.html ریشه ساخته می‌شود (tools/build.sh) و همان منتشر می‌شود.
cd "$(dirname "$0")/.."
B=$(date -u +%Y%m%d%H%M%S)
sed -i "s/<meta name=\"pm-build\" content=\"[0-9]*\">/<meta name=\"pm-build\" content=\"$B\">/" src/index.html
# ساخت نسخهٔ انتشار از منبع (کوچک‌سازی JS و CSS)
tools/build.sh
echo "$B" > build.txt
T=$(mktemp -d)
# بزرگ‌ترین اسکریپت درون‌خطی همان اسکریپت اصلی است (به جایگاهش وابسته نیست)
python3 -c "import re,sys;s=open('index.html').read();b=re.findall(r'<script>([\s\S]*?)</script>',s);open(sys.argv[1],'w').write(max(b,key=len))" "$T/main.js"
node --check "$T/main.js"
# اسکریپت‌های کوچک‌تر هم سینتکس‌شان سنجیده شود
python3 -c "import re,sys;s=open('index.html').read();b=re.findall(r'<script>([\s\S]*?)</script>',s);[open(sys.argv[1]+'/s%d.js'%i,'w').write(x) for i,x in enumerate(b)]" "$T"
for f in "$T"/s*.js; do node --check "$f"; done
# آزمون پیش از انتشار (دسکتاپ و گوشی، دادهٔ ساختگی)؛ اگر خطا داشت انتشار متوقف می‌شود. رد کردن: SKIP_TEST=1
[ -n "$SKIP_TEST" ] || tools/test/run.sh
git add -A
git commit -q -m "$1

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01RLpbZRPBz5jueAm55E9GhL"
BR=$(git branch --show-current)
for i in 1 2 3 4; do git push -q -u origin "$BR" && break; sleep $((2**i)); done
echo "pushed $(git rev-parse --short HEAD) build $B"
