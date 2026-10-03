#!/bin/bash
# One-time (re-runnable) root setup for ekat.ca/fh on the VPS:
#   sudo bash /var/www/fh/deploy/install.sh [first-login-email "Full Name"]
# Creates the fh user + /var/lib/fh, installs fh-api.service, /usr/local/sbin/fh-deploy,
# its sudoers rule, the nginx snippet, and points the GitHub Actions deploy key at fh-deploy.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "run as root"; exit 1; }
HERE=$(cd "$(dirname "$0")" && pwd)
NODE=/opt/node-runtime/node

id fh >/dev/null 2>&1 || useradd --system --home-dir /var/lib/fh --no-create-home --shell /usr/sbin/nologin fh
install -d -o fh -g fh -m 700 /var/lib/fh

install -m 644 "$HERE/fh-api.service" /etc/systemd/system/fh-api.service
systemctl daemon-reload
systemctl enable -q fh-api
systemctl restart fh-api

install -m 755 "$HERE/fh-deploy.sh" /usr/local/sbin/fh-deploy
echo 'idunnoguesswho ALL=(root) NOPASSWD: /usr/local/sbin/fh-deploy' > /etc/sudoers.d/fh-deploy.tmp
chmod 440 /etc/sudoers.d/fh-deploy.tmp
visudo -cqf /etc/sudoers.d/fh-deploy.tmp && mv /etc/sudoers.d/fh-deploy.tmp /etc/sudoers.d/fh-deploy

# GitHub Actions key: was pinned to a plain git pull; now runs fh-deploy (which also restarts the API).
AK=/home/idunnoguesswho/.ssh/authorized_keys
if grep -q 'github-actions fh deploy' "$AK" && ! grep -q 'sbin/fh-deploy' "$AK"; then
  cp -a "$AK" "$AK.bak-$(date +%Y%m%d%H%M%S)"
  sed -i '/github-actions fh deploy/ s|command="[^"]*"|command="sudo -n /usr/local/sbin/fh-deploy"|' "$AK"
fi

install -m 644 "$HERE/fh.location.conf" /etc/nginx/snippets/fh.location.conf
nginx -t -q && systemctl reload nginx

sleep 1
curl -fsS http://127.0.0.1:3300/api/health && echo "  fh-api is up"

if [ $# -ge 1 ]; then
  /usr/sbin/runuser -u fh -- "$NODE" /var/www/fh/server/fh-user.js add "$1" "${2:-}" || true
fi
echo "Manage logins: sudo -u fh $NODE /var/www/fh/server/fh-user.js list|add|reset|disable"
