/* server.js — storage API for DSHC Field Forms (https://ekat.ca/fh/).
   nginx proxies /fh/api/* to http://127.0.0.1:3300/api/*. No dependencies:
   node:http + node:sqlite + node:crypto. Run: node server.js

   Records are shared by everyone who signs in. Users are managed with fh-user.js. */
import crypto from 'node:crypto';
import http from 'node:http';
import { openDb, checkPassword, hashPassword } from './db.js';

const PORT = +(process.env.PORT || 3300);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_BODY = 40 * 1024 * 1024;              // records carry photos and signatures as data URLs
const TOKEN_DAYS = 90;
const HISTORY_GAP_MS = 30 * 60 * 1000;

const db = openDb();

/* ---- login tokens: base64url(payload).hmac, secret kept in the db ---- */
let secret = db.prepare('SELECT v FROM meta WHERE k = ?').get('secret')?.v;
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO meta (k, v) VALUES (?, ?)').run('secret', secret);
}
const sign = (s) => crypto.createHmac('sha256', secret).update(s).digest('base64url');
function makeToken(user) {
  const p = Buffer.from(JSON.stringify({ u: user.id, v: user.pwv, e: Date.now() + TOKEN_DAYS * 864e5 })).toString('base64url');
  return `${p}.${sign(p)}`;
}
function userFromToken(token) {
  const [p, s] = String(token || '').split('.');
  if (!p || !s) return null;
  const want = Buffer.from(sign(p)), got = Buffer.from(s);
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) return null;
  let t; try { t = JSON.parse(Buffer.from(p, 'base64url').toString()); } catch { return null; }
  if (!t || t.e < Date.now()) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(t.u);
  return u && !u.disabled && u.pwv === t.v ? u : null;
}
const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });

/* ---- records ---- */
const getRec = db.prepare('SELECT * FROM records WHERE id = ?');
const nextRev = db.prepare('SELECT COALESCE(MAX(rev), 0) + 1 AS r FROM records');
const upsert = db.prepare(`INSERT INTO records (id, type, data, rev, updated, updated_by, deleted) VALUES (?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data, rev = excluded.rev,
  updated = excluded.updated, updated_by = excluded.updated_by, deleted = excluded.deleted`);
const toHistory = db.prepare(`INSERT INTO history (id, type, data, rev, updated, updated_by, deleted, saved)
  SELECT id, type, data, rev, updated, updated_by, deleted, ? FROM records WHERE id = ?`);
const wire = (r) => ({ id: r.id, rev: r.rev, deleted: !!r.deleted, data: r.deleted ? null : JSON.parse(r.data) });

// Keep the previous version before it is replaced, without storing every autosave.
function keepHistory(cur, user, deleting) {
  if (!cur || cur.deleted) return;
  const old = Date.now() - Date.parse(cur.updated) > HISTORY_GAP_MS;
  if (deleting || old || cur.updated_by !== user.id) toHistory.run(new Date().toISOString(), cur.id);
}

function write(id, user, base, data) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const cur = getRec.get(id);
    if (cur && cur.rev !== base) { db.exec('ROLLBACK'); return { conflict: wire(cur) }; }
    keepHistory(cur, user, data === null);
    const rev = nextRev.get().r;
    if (data === null) upsert.run(id, cur ? cur.type : 'unknown', null, rev, new Date().toISOString(), user.id, 1);
    else upsert.run(id, data.type, JSON.stringify(data), rev, new Date().toISOString(), user.id, 0);
    db.exec('COMMIT');
    return { rev };
  } catch (e) { db.exec('ROLLBACK'); throw e; }
}

/* ---- http plumbing ---- */
function send(res, status, body) {
  const s = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': Buffer.byteLength(s) });
  res.end(s);
}
function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!size) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Bad JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}
const ID_RE = /^[\w-]{1,100}$/;

async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname, m = req.method;

  if (p === '/api/health') return send(res, 200, { ok: true });

  if (p === '/api/login' && m === 'POST') {
    const b = await readJson(req);
    const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(b.email || '').trim());
    if (!u || u.disabled || !checkPassword(b.password, u.pass)) return send(res, 401, { error: 'Wrong email or password' });
    return send(res, 200, { token: makeToken(u), user: publicUser(u) });
  }

  const auth = req.headers.authorization || '';
  const user = userFromToken(auth.startsWith('Bearer ') ? auth.slice(7) : '');
  if (!user) return send(res, 401, { error: 'Please sign in' });

  if (p === '/api/me' && m === 'GET') return send(res, 200, { user: publicUser(user) });

  if (p === '/api/password' && m === 'POST') {
    const b = await readJson(req);
    if (!checkPassword(b.old, user.pass)) return send(res, 400, { error: 'Current password is wrong' });
    if (String(b.new || '').length < 8) return send(res, 400, { error: 'New password must be at least 8 characters' });
    db.prepare('UPDATE users SET pass = ?, pwv = pwv + 1 WHERE id = ?').run(hashPassword(b.new), user.id);
    return send(res, 200, { token: makeToken(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
  }

  // Everything changed after rev `since` (0 = full load, which skips deleted records).
  if (p === '/api/records' && m === 'GET') {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const rows = since
      ? db.prepare('SELECT * FROM records WHERE rev > ? ORDER BY rev').all(since)
      : db.prepare('SELECT * FROM records WHERE deleted = 0 ORDER BY rev').all();
    const rev = db.prepare('SELECT COALESCE(MAX(rev), 0) AS r FROM records').get().r;
    return send(res, 200, { rev, records: rows.map(wire) });
  }

  const rm = /^\/api\/records\/([^/]+)$/.exec(p);
  if (rm) {
    const id = decodeURIComponent(rm[1]);
    if (!ID_RE.test(id)) return send(res, 400, { error: 'Bad record id' });
    if (m === 'PUT') {
      const b = await readJson(req), data = b.data;
      if (!data || typeof data !== 'object' || data.id !== id || typeof data.type !== 'string' || !data.type) return send(res, 400, { error: 'Bad record' });
      const r = write(id, user, Number(b.base) || 0, data);
      return r.conflict ? send(res, 409, { error: 'Changed elsewhere', record: r.conflict }) : send(res, 200, { rev: r.rev });
    }
    if (m === 'DELETE') {
      const cur = getRec.get(id);
      if (!cur || cur.deleted) return send(res, 200, { rev: cur ? cur.rev : 0 });
      const r = write(id, user, Number(url.searchParams.get('base')) || 0, null);
      return r.conflict ? send(res, 409, { error: 'Changed elsewhere', record: r.conflict }) : send(res, 200, { rev: r.rev });
    }
  }
  return send(res, 404, { error: 'Not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    if (!e.status) console.error(new Date().toISOString(), req.method, req.url, e);
    if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
  });
}).listen(PORT, HOST, () => console.log(`fh-api listening on ${HOST}:${PORT}`));
