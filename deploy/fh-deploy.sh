#!/bin/bash
# fh-deploy — installed as /usr/local/sbin/fh-deploy (root). The GitHub Action's SSH
# key is pinned to `sudo -n /usr/local/sbin/fh-deploy`, so this is all it can run.
# Fast-forwards /var/www/fh to origin/main and restarts the API if server/ changed.
# This is a copy: after editing deploy/fh-deploy.sh, re-run deploy/install.sh.
set -euo pipefail
REPO=/var/www/fh
as_owner() { /usr/sbin/runuser -u idunnoguesswho -- "$@"; }

old=$(as_owner git -C "$REPO" rev-parse HEAD)
as_owner git -C "$REPO" fetch -q origin main
as_owner git -C "$REPO" reset -q --hard origin/main
new=$(as_owner git -C "$REPO" rev-parse HEAD)

if [ "$old" != "$new" ] && ! as_owner git -C "$REPO" diff --quiet "$old" "$new" -- server; then
  systemctl restart fh-api
elif ! systemctl is-active -q fh-api; then
  systemctl start fh-api
fi

for i in 1 2 3 4 5 6 7 8 9 10; do
  curl -fsS http://127.0.0.1:3300/api/health >/dev/null 2>&1 && break
  [ "$i" = 10 ] && { echo "fh-api not healthy after deploy"; journalctl -u fh-api -n 20 --no-pager; exit 1; }
  sleep 1
done
as_owner git -C "$REPO" log --oneline -1
