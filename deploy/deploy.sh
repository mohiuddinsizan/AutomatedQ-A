#!/usr/bin/env bash
# Puts the current code on the AWS server and restarts it.
#   deploy/deploy.sh --first   first time: server setup, database copy, uploads, .env
#   deploy/deploy.sh           later: code update only (your data on the server is kept)
set -euo pipefail
cd "$(dirname "$0")/.."
. ~/.config/bigbang-aws/server.env
SSH="ssh -i $KEY -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 ubuntu@$PUBLIC_IP"
SCP="scp -i $KEY -o StrictHostKeyChecking=accept-new"
CERT_EMAIL="${CERT_EMAIL:-}"

if [ "${1:-}" = "--first" ]; then
  : "${CERT_EMAIL:?Set CERT_EMAIL=you@example.com (HTTPS certificate notices go there)}"
  echo "== Setting up the server"
  $SCP deploy/server-setup.sh ubuntu@$PUBLIC_IP:/tmp/
  $SSH "sudo bash /tmp/server-setup.sh $DOMAIN $CERT_EMAIL"

  echo "== Writing the server's .env (secrets go straight to the server, never into git)"
  DBURL=$($SSH "sudo cat /opt/bigbang/.database_url")
  # Keep every setting, swap the database and upload folder for the server's own,
  # and drop malformed lines (a KEY with no "=").
  grep -E '^[A-Za-z_][A-Za-z0-9_]*=' .env | grep -vE '^(DATABASE_URL|UPLOAD_DIR|NODE_ENV)=' > /tmp/bigbang.env.server
  { echo "DATABASE_URL=$DBURL"; echo "UPLOAD_DIR=/var/lib/bigbang/uploads"; } >> /tmp/bigbang.env.server
  $SCP /tmp/bigbang.env.server ubuntu@$PUBLIC_IP:/tmp/bigbang.env
  rm -f /tmp/bigbang.env.server
  $SSH "sudo install -o bigbang -g bigbang -m 600 /tmp/bigbang.env /opt/bigbang/app/.env && rm /tmp/bigbang.env"

  echo "== Copying the database"
  set -a; . ./.env; set +a
  pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" > /tmp/bigbang.dump
  $SCP /tmp/bigbang.dump ubuntu@$PUBLIC_IP:/tmp/bigbang.dump
  rm -f /tmp/bigbang.dump
  $SSH "sudo -u bigbang pg_restore --no-owner --no-privileges --clean --if-exists -d \"\$(sudo cat /opt/bigbang/.database_url)\" /tmp/bigbang.dump; rm /tmp/bigbang.dump"

  echo "== Copying uploaded photos and voice notes"
  if [ -d uploads ]; then
    rsync -az -e "ssh -i $KEY" --rsync-path="sudo rsync" uploads/ ubuntu@$PUBLIC_IP:/var/lib/bigbang/uploads/
    $SSH "sudo chown -R bigbang:bigbang /var/lib/bigbang/uploads"
  fi
fi

echo "== Uploading code"
rsync -az --delete -e "ssh -i $KEY" --rsync-path="sudo rsync" \
  --exclude node_modules --exclude .next --exclude uploads --exclude '.env*' --exclude .git \
  ./ ubuntu@$PUBLIC_IP:/opt/bigbang/app/
$SSH "sudo chown -R bigbang:bigbang /opt/bigbang/app"

echo "== Building on the server (a few minutes on a micro instance)"
$SSH "cd /opt/bigbang/app && sudo -u bigbang npm ci --no-audit --no-fund && sudo -u bigbang NODE_OPTIONS=--max-old-space-size=1536 npm run build && sudo systemctl restart bigbang"

sleep 6
code=$(curl -s -o /dev/null -w "%{http_code}" "https://$DOMAIN/login" || true)
echo
echo "Live at https://$DOMAIN  (login page answered $code)"
