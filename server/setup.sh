#!/usr/bin/env bash
# =====================================================================
#  نصب سامانهٔ پروژه روی سرور شخصی (Ubuntu 22.04 / 24.04)
#  دیتابیس و API (Supabase متن‌باز) + فایل‌ها + خود سایت + HTTPS + پشتیبان شبانه
#
#  اجرا (روی سرور، با کاربر root):
#     bash setup.sh pm.example.ir api.example.ir admin@example.ir
#  آرگومان‌ها: دامنهٔ سایت، دامنهٔ API، ایمیل برای گواهی HTTPS
#  اجرای دوباره بی‌خطر است؛ رمزها فقط بار اول ساخته می‌شوند.
# =====================================================================
set -euo pipefail

SITE_DOMAIN="${1:?دامنهٔ سایت را بدهید، مثلاً pm.example.ir}"
API_DOMAIN="${2:?دامنهٔ API را بدهید، مثلاً api.example.ir}"
ACME_EMAIL="${3:?یک ایمیل برای گواهی HTTPS بدهید}"
BASE=/opt/pm
REPO_URL="${REPO_URL:-https://github.com/CONSPROJ/pm.git}"
SUPABASE_REF="${SUPABASE_REF:-master}"
# Docker Hub از ایران مسدود است؛ آینه‌های داخلی (به ترتیب امتحان می‌شوند)
MIRRORS="${DOCKER_MIRRORS:-https://docker.arvancloud.ir https://docker.iranserver.com https://registry.docker.ir}"

say(){ printf '\n\033[1;36m== %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "با root اجرا کنید (sudo -i)"; exit 1; }

say "۱/۸ به‌روزرسانی سیستم و ابزارها"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y ca-certificates curl git openssl ufw cron jq python3 postgresql-client unattended-upgrades
dpkg-reconfigure -f noninteractive unattended-upgrades || true   # به‌روزرسانی امنیتی خودکار

say "۲/۸ نصب Docker (از مخزن خود Ubuntu) و آینهٔ داخلی"
apt-get install -y docker.io docker-compose-v2 || apt-get install -y docker.io docker-compose-plugin
mkdir -p /etc/docker
python3 - "$MIRRORS" <<'PY'
import json, sys, os
p = '/etc/docker/daemon.json'
d = json.load(open(p)) if os.path.exists(p) else {}
d['registry-mirrors'] = sys.argv[1].split()
d.setdefault('log-driver', 'json-file'); d.setdefault('log-opts', {'max-size': '20m', 'max-file': '3'})
json.dump(d, open(p, 'w'), indent=2)
PY
systemctl enable --now docker
systemctl restart docker

say "۳/۸ دیوار آتش: فقط SSH، HTTP و HTTPS باز"
ufw allow OpenSSH >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null

say "۴/۸ دریافت Supabase و سایت"
mkdir -p "$BASE"
if [ ! -d "$BASE/supabase-src" ]; then
  # فقط پوشهٔ docker از مخزن بزرگ Supabase
  git clone --depth 1 --filter=blob:none --sparse --branch "$SUPABASE_REF" https://github.com/supabase/supabase "$BASE/supabase-src"
  git -C "$BASE/supabase-src" sparse-checkout set docker
fi
mkdir -p "$BASE/supabase"
[ -f "$BASE/supabase/docker-compose.yml" ] || cp -r "$BASE/supabase-src/docker/." "$BASE/supabase/"
# پورت‌های دیتابیس و API فقط روی خود سرور باز باشند (Docker دیوار آتش را دور می‌زند)؛
# دسترسی بیرونی فقط از راه HTTPS و Caddy
sed -i -E 's/^([[:space:]]*-[[:space:]]*["'"'"']?)(\$\{[A-Z_]+\}:)/\1127.0.0.1:\2/' "$BASE/supabase/docker-compose.yml"
if [ ! -d "$BASE/site/.git" ]; then git clone --depth 1 "$REPO_URL" "$BASE/site"; fi

say "۵/۸ ساختن رمزها و کلیدها (فقط بار اول)"
ENV="$BASE/supabase/.env"
if [ ! -f "$ENV" ]; then
  cp "$BASE/supabase/.env.example" "$ENV"
  rnd(){ openssl rand -hex "$1"; }
  JWT_SECRET=$(rnd 32)
  b64url(){ openssl base64 -A | tr '+/' '-_' | tr -d '='; }
  jwt(){ # $1 = role
    local now exp h p s
    now=$(date +%s); exp=$((now + 10*365*24*3600))
    h=$(printf '{"alg":"HS256","typ":"JWT"}' | b64url)
    p=$(printf '{"role":"%s","iss":"supabase","iat":%s,"exp":%s}' "$1" "$now" "$exp" | b64url)
    s=$(printf '%s.%s' "$h" "$p" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | b64url)
    printf '%s.%s.%s' "$h" "$p" "$s"
  }
  setv(){ # کلید را در .env جایگزین یا اضافه می‌کند
    if grep -q "^$1=" "$ENV"; then sed -i "s|^$1=.*|$1=$2|" "$ENV"; else echo "$1=$2" >> "$ENV"; fi
  }
  setv POSTGRES_PASSWORD "$(rnd 24)"
  setv JWT_SECRET "$JWT_SECRET"
  setv ANON_KEY "$(jwt anon)"
  setv SERVICE_ROLE_KEY "$(jwt service_role)"
  setv DASHBOARD_USERNAME "pmadmin"
  setv DASHBOARD_PASSWORD "$(rnd 16)"
  setv SECRET_KEY_BASE "$(rnd 32)"
  setv VAULT_ENC_KEY "$(rnd 16)"
  setv PG_META_CRYPTO_KEY "$(rnd 16)"
  setv LOGFLARE_PUBLIC_ACCESS_TOKEN "$(rnd 24)"
  setv LOGFLARE_PRIVATE_ACCESS_TOKEN "$(rnd 24)"
  setv SITE_URL "https://$SITE_DOMAIN"
  setv API_EXTERNAL_URL "https://$API_DOMAIN"
  setv SUPABASE_PUBLIC_URL "https://$API_DOMAIN"
  setv ADDITIONAL_REDIRECT_URLS ""
  chmod 600 "$ENV"
fi

say "۶/۸ بالا آوردن Supabase (اولین بار چند دقیقه طول می‌کشد)"
cd "$BASE/supabase"
docker compose pull
docker compose up -d

say "۷/۸ HTTPS خودکار و سرو کردن سایت با Caddy"
mkdir -p "$BASE/caddy"
cat > "$BASE/caddy/Caddyfile" <<CADDY
{
  email $ACME_EMAIL
}
$SITE_DOMAIN {
  root * /srv/site
  # فایل‌های داخلی ریپو (گیت، SQL، اسکریپت‌های سرور) از بیرون دیده نشوند
  @internal path /.git* /server/* /out/* *.sql *.md
  respond @internal 404
  file_server
  encode gzip
  header {
    Strict-Transport-Security "max-age=31536000"
    X-Content-Type-Options "nosniff"
    Referrer-Policy "strict-origin-when-cross-origin"
    X-Frame-Options "SAMEORIGIN"
  }
}
$API_DOMAIN {
  reverse_proxy localhost:8000
  encode gzip
}
CADDY
docker rm -f pm-caddy >/dev/null 2>&1 || true
docker run -d --name pm-caddy --restart unless-stopped --network host \
  -v "$BASE/caddy/Caddyfile:/etc/caddy/Caddyfile:ro" \
  -v "$BASE/site:/srv/site:ro" \
  -v pm_caddy_data:/data -v pm_caddy_config:/config \
  caddy:2

say "۸/۸ به‌روزرسانی خودکار سایت از گیت‌هاب و پشتیبان شبانه"
install -m 755 "$BASE/site/server/backup.sh" /usr/local/bin/pm-backup
cat > /etc/cron.d/pm <<CRON
*/5 * * * * root cd $BASE/site && git pull -q --ff-only >/dev/null 2>&1
30 2 * * *  root /usr/local/bin/pm-backup >> /var/log/pm-backup.log 2>&1
CRON
chmod 644 /etc/cron.d/pm

ANON=$(grep '^ANON_KEY=' "$ENV" | cut -d= -f2-)
DPASS=$(grep '^DASHBOARD_PASSWORD=' "$ENV" | cut -d= -f2-)
cat <<DONE

=====================================================================
 نصب تمام شد ✓
 سایت:            https://$SITE_DOMAIN
 API:             https://$API_DOMAIN
 پنل دیتابیس:     https://$API_DOMAIN   (کاربر: pmadmin)
 رمز پنل دیتابیس: $DPASS
 کلید عمومی سایت (ANON_KEY) — این را برای وصل کردن سایت لازم داریم:
 $ANON

 همهٔ رمزها در $ENV است (فقط root می‌خواند).
 قدم بعد: انتقال داده‌ها با   bash $BASE/site/server/migrate.sh
=====================================================================
DONE
