#!/usr/bin/env bash
# Shares the site on a public https link (Cloudflare quick tunnel) for demos.
# Builds the production version, runs it on port 3100, and prints the link.
# Stop with: npm run share:stop
set -e
cd "$(dirname "$0")/.."
LOG=~/.cache/bigbang-host
mkdir -p "$LOG"
pkill -f "cloudflared tunnel" 2>/dev/null || true
fuser -k 3100/tcp 2>/dev/null || true

npm run build
setsid nohup npm run start -- -p 3100 > "$LOG/server.log" 2>&1 < /dev/null &
sleep 5
: > "$LOG/tunnel.log"
setsid nohup ~/.local/bin/cloudflared tunnel --no-autoupdate --url http://localhost:3100 > "$LOG/tunnel.log" 2>&1 < /dev/null &
for i in $(seq 1 40); do
  URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG/tunnel.log" | head -1)
  [ -n "$URL" ] && break
  sleep 1
done
echo
echo "Public link: ${URL:-not ready yet — check $LOG/tunnel.log}"
