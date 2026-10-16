#!/usr/bin/env bash
# Puts the current code on the AWS server and restarts it.
#   deploy/deploy.sh --first   first time: server setup, database copy, uploads, .env
#   deploy/deploy.sh --finish  resume a --first run after its data step (build, admin password, import)
#   deploy/deploy.sh           later: code update only (your data on the server is kept)
set -euo pipefail
cd "$(dirname "$0")/.."
. ~/.config/bigbang-aws/server.env
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 -o ServerAliveInterval=30 -o ServerAliveCountMax=10 ubuntu@$PUBLIC_IP"
SCP="scp -i $KEY -o StrictHostKeyChecking=accept-new"
CERT_EMAIL="${CERT_EMAIL:-}"

if [ "${1:-}" = "--first" ]; then
  echo "== Setting up the server"
  $SCP deploy/server-setup.sh ubuntu@$PUBLIC_IP:/tmp/
  $SSH "sudo bash /tmp/server-setup.sh $DOMAIN $CERT_EMAIL"

  echo "== Writing the server's .env (secrets go straight to the server, never into git)"
  DBURL=$($SSH "sudo cat /opt/bigbang/.database_url")
  # Keep the API keys and settings, give the server its own database, upload folder and
  # fresh session/cron secrets, and drop malformed lines (a KEY with no "=").
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env \
    | grep -vE '^(DATABASE_URL|UPLOAD_DIR|NODE_ENV|SESSION_SECRET|CRON_SECRET|ADMIN_PASSWORD)=' > /tmp/bigbang.env.server
  {
    echo "DATABASE_URL=$DBURL"
    echo "UPLOAD_DIR=/var/lib/bigbang/uploads"
    echo "SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')"
    echo "CRON_SECRET=$(openssl rand -hex 32)"
  } >> /tmp/bigbang.env.server
  $SCP /tmp/bigbang.env.server ubuntu@$PUBLIC_IP:/tmp/bigbang.env
  rm -f /tmp/bigbang.env.server
  $SSH "sudo install -o bigbang -g bigbang -m 600 /tmp/bigbang.env /opt/bigbang/app/.env && rm /tmp/bigbang.env"

  echo "== Copying the database (accounts, courses, settings), then removing test data"
  # Read just the database address: .env may hold placeholder lines that aren't valid shell.
  LOCAL_DB=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/')
  pg_dump --format=custom --no-owner --no-privileges "$LOCAL_DB" > /tmp/bigbang.dump
  $SCP /tmp/bigbang.dump ubuntu@$PUBLIC_IP:/tmp/bigbang.dump
  rm -f /tmp/bigbang.dump
  $SCP deploy/production-clean.sql ubuntu@$PUBLIC_IP:/tmp/production-clean.sql
  $SSH 'U=$(sudo cat /opt/bigbang/.database_url); sudo -u bigbang pg_restore --no-owner --no-privileges -d "$U" /tmp/bigbang.dump; sudo -u bigbang psql "$U" -v ON_ERROR_STOP=1 -f /tmp/production-clean.sql; rm /tmp/bigbang.dump /tmp/production-clean.sql'
  FIRST=1
fi

[ "${1:-}" = "--finish" ] && FIRST=1

echo "== Uploading code"
rsync -az --delete -e "ssh -i $KEY" --rsync-path="sudo rsync" \
  --exclude node_modules --exclude .next --exclude uploads --exclude '.env*' --exclude .git \
  ./ ubuntu@$PUBLIC_IP:/opt/bigbang/app/
$SSH "sudo chown -R bigbang:bigbang /opt/bigbang/app"

echo "== Building on the server (a few minutes on a micro instance)"
# Schema changes (new columns or tables) are applied before the build. It never waits for
# input: a change that would lose data stops the deploy here instead of being applied.
$SSH "sudo -u bigbang bash -c 'cd /opt/bigbang/app && npm ci --no-audit --no-fund && timeout 180 npx drizzle-kit push < /dev/null && NODE_OPTIONS=--max-old-space-size=1536 npm run build' && sudo systemctl restart bigbang"

sleep 8
if [ "${FIRST:-}" = 1 ]; then
  echo "== New super admin password, and a fresh full import from BigBang"
  PASS=$(openssl rand -base64 18 | tr -d '/+=' | cut -c1-16)
  $SSH "sudo -u bigbang bash -c 'cd /opt/bigbang/app && NEW_PASS=$PASS node --env-file=.env deploy/set-admin-password.mjs'"
  $SSH 'CS=$(sudo grep "^CRON_SECRET=" /opt/bigbang/app/.env | cut -d= -f2-); curl -s -m 1800 -H "Authorization: Bearer $CS" "http://127.0.0.1:3000/api/cron/sync?full=1&all=1" | head -c 400; echo'
  echo
  echo "SUPER ADMIN PASSWORD (shown once, save it now): $PASS"
fi
code=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/login" || true)
echo
echo "Live at https://$DOMAIN  (login page answered $code)"
