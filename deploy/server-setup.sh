#!/usr/bin/env bash
# One-time setup of the Ubuntu 24.04 server (run as root by deploy.sh --first).
# Installs Node, PostgreSQL, nginx with rate limits, HTTPS, firewall, swap and the daily import.
# Usage: server-setup.sh <domain> <cert-email>
set -euo pipefail
DOMAIN="$1"; EMAIL="$2"
export DEBIAN_FRONTEND=noninteractive

# 1 GB of RAM is tight for building Next.js: add 2 GB of swap.
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

apt-get update -q
apt-get install -yq postgresql nginx certbot python3-certbot-nginx ufw fail2ban unattended-upgrades curl rsync

# Node 22 LTS from the official tarball.
if ! command -v node >/dev/null || ! node -v | grep -q '^v22'; then
  V=$(curl -s https://nodejs.org/dist/latest-v22.x/ | grep -o 'node-v22[0-9.]*-linux-x64.tar.xz' | head -1)
  curl -sSL "https://nodejs.org/dist/latest-v22.x/$V" | tar -xJ -C /opt
  ln -sf /opt/${V%.tar.xz}/bin/{node,npm,npx} /usr/local/bin/
fi

id bigbang >/dev/null 2>&1 || useradd --system --create-home --home-dir /opt/bigbang --shell /usr/sbin/nologin bigbang
mkdir -p /opt/bigbang/app /var/lib/bigbang/uploads
chown -R bigbang:bigbang /opt/bigbang /var/lib/bigbang

# PostgreSQL: small memory footprint, local connections only.
PGCONF=$(ls /etc/postgresql/*/main/postgresql.conf)
grep -q "bigbang tuning" "$PGCONF" || cat >> "$PGCONF" <<PG
# bigbang tuning for a 1 GB server
shared_buffers = 128MB
work_mem = 4MB
max_connections = 30
listen_addresses = 'localhost'
PG
systemctl restart postgresql
if ! sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='bigbang'" | grep -q 1; then
  PGPASS=$(openssl rand -hex 24)
  sudo -u postgres psql -c "create role bigbang login password '$PGPASS'"
  sudo -u postgres psql -c "create database bigbang owner bigbang"
  echo "postgresql://bigbang:$PGPASS@localhost:5432/bigbang" > /opt/bigbang/.database_url
  chmod 600 /opt/bigbang/.database_url && chown bigbang /opt/bigbang/.database_url
fi

# The app as a service, with a memory ceiling so it can't take the database down with it.
cat > /etc/systemd/system/bigbang.service <<UNIT
[Unit]
Description=BIG BANG EXAM CARE portal
After=network.target postgresql.service

[Service]
User=bigbang
WorkingDirectory=/opt/bigbang/app
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=512
ExecStart=/usr/local/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=5
MemoryMax=700M

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable bigbang >/dev/null

# nginx: the only public entry. Rate limits so one client (or a bot) can't flood the server,
# which would burn CPU and the free monthly traffic allowance.
cat > /etc/nginx/conf.d/bigbang-limits.conf <<'NGX'
limit_req_zone $binary_remote_addr zone=pages:10m rate=10r/s;
map $request_method $post_key { POST $binary_remote_addr; default ""; }
limit_req_zone $post_key zone=posts:10m rate=30r/m;
limit_conn_zone $binary_remote_addr zone=perip:10m;
limit_req_status 429;
limit_conn_status 429;
server_tokens off;
NGX
cat > /etc/nginx/sites-available/bigbang <<NGX
server {
  listen 80;
  listen [::]:80;
  server_name $DOMAIN;

  client_max_body_size 12m;       # 3 photos + a voice note; nothing bigger gets in
  client_body_timeout 30s;
  send_timeout 30s;
  keepalive_timeout 15s;
  limit_conn perip 30;

  location / {
    limit_req zone=pages burst=40 nodelay;
    limit_req zone=posts burst=10 nodelay;
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Host \$host;
    proxy_read_timeout 90s;        # the AI answer can take ~10 s; anything longer is cut off
  }
  location /_next/static/ {
    proxy_pass http://127.0.0.1:3000;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
}
NGX
ln -sf /etc/nginx/sites-available/bigbang /etc/nginx/sites-enabled/bigbang
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

# Firewall: web and SSH only. fail2ban blocks repeated SSH guessing.
ufw allow OpenSSH >/dev/null && ufw allow 'Nginx Full' >/dev/null && ufw --force enable >/dev/null
systemctl enable --now fail2ban >/dev/null

# Keep logs from filling the disk.
mkdir -p /etc/systemd/journald.conf.d
printf "[Journal]\nSystemMaxUse=200M\n" > /etc/systemd/journald.conf.d/size.conf
systemctl restart systemd-journald

# Free HTTPS (needed for the microphone on phones). Renews itself.
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "!! HTTPS not set up yet; rerun: certbot --nginx -d $DOMAIN"

# Daily import at 03:00 Bangladesh time (21:00 UTC), plus a nightly database backup kept for 7 days.
cat > /etc/cron.d/bigbang <<CRON
0 21 * * * bigbang . /opt/bigbang/app/.env && curl -s -m 600 -H "Authorization: Bearer \$CRON_SECRET" http://127.0.0.1:3000/api/cron/sync > /var/lib/bigbang/last-sync.json
30 20 * * * postgres pg_dump bigbang | gzip > /var/lib/postgresql/bigbang-\$(date +\%a).sql.gz
CRON
chmod 644 /etc/cron.d/bigbang
echo "Server setup done."
