# DSHC Field Forms

Mobile site-visit forms and PDF package generator, served at **https://ekat.ca/fh/**.

Site visit workflow (home > Start site visit)
- One form per visit. It holds C.001 FLHA, C.002 Vehicle Inspection, C.004 Daily Report, C.008 Mileage Cover Sheet,
  C.024 Worksite Inspection, C.051 Journey Management and C.052 360 Checklist, plus each fume hood inspection.
- Add each hood from the visit (customer, lab, tech carry over). Tap "Make PDFs" to get one PDF per form and per hood in a ZIP.
- Save your signature, vehicle and usual start point in Settings once; customers remember their site details.

## Where the data lives

Everything is stored on the VPS in `/var/lib/fh/fh.db` (SQLite) and shared by everyone who signs in.
Your name, signature and vehicle in Settings belong to your login; everything else is shared.
Saves go straight to the server. If there's no signal, the app shows "Not saved — no connection" and
keeps retrying while the page stays open. If someone else saved the same record first, you get their
version instead of silently overwriting it. Earlier versions are kept in the `history` table.

Records saved by the old device-only version are still in that phone's browser: sign in on the phone
and tap "Upload them now" on the home screen (or Settings > Data and backup).

## Layout

| Path | What |
|---|---|
| `public/` | the app (static, no build step), nginx alias for `/fh/` |
| `server/server.js` | API at `/fh/api/` → `127.0.0.1:3300`, Node built-ins only (`node:sqlite`), no `npm install` |
| `server/fh-user.js` | manage logins |
| `deploy/` | systemd unit, nginx snippet, deploy script, one-time `install.sh` |

## Deploys

Push to `main` → GitHub Action SSHes in as `idunnoguesswho` with a key pinned to
`sudo -n /usr/local/sbin/fh-deploy`, which resets `/var/www/fh` to `origin/main` and restarts
`fh-api` when `server/` changed. Changes to files in `deploy/` are not applied automatically:
re-run `sudo bash /var/www/fh/deploy/install.sh`.

## Logins

```
sudo -u fh /opt/node-runtime/node /var/www/fh/server/fh-user.js list
sudo -u fh /opt/node-runtime/node /var/www/fh/server/fh-user.js add someone@example.com "Their Name"
sudo -u fh /opt/node-runtime/node /var/www/fh/server/fh-user.js reset someone@example.com
sudo -u fh /opt/node-runtime/node /var/www/fh/server/fh-user.js disable someone@example.com
```
People change their own password in Settings.

## Running locally

```
FH_DATA_DIR=./data PORT=3399 node server/server.js
```
and serve `public/` with `/api/` proxied to it (the page calls `api/` relative to itself).
