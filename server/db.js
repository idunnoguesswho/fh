/* db.js — SQLite storage shared by server.js and fh-user.js.
   Uses Node's built-in node:sqlite, so there is nothing to npm install.
   Everything lives in one file: $FH_DATA_DIR/fh.db (default /var/lib/fh). */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DATA_DIR = process.env.FH_DATA_DIR || '/var/lib/fh';

export function openDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(DATA_DIR, 'fh.db'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id       INTEGER PRIMARY KEY,
      email    TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name     TEXT NOT NULL DEFAULT '',
      pass     TEXT NOT NULL,
      pwv      INTEGER NOT NULL DEFAULT 1,      -- bumped on password change; old logins stop working
      disabled INTEGER NOT NULL DEFAULT 0,
      created  TEXT NOT NULL
    );
    -- One row per app record (form, customer, settings...). data is the record as JSON.
    -- rev is a global counter: clients ask "what changed since rev N" and send the rev
    -- they last saw when saving, so one device can't silently overwrite another's edit.
    CREATE TABLE IF NOT EXISTS records (
      id         TEXT PRIMARY KEY,
      type       TEXT NOT NULL,
      data       TEXT,
      rev        INTEGER NOT NULL,
      updated    TEXT NOT NULL,
      updated_by INTEGER,
      deleted    INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS records_rev ON records (rev);
    -- Earlier versions of records (kept on delete, on a different user's edit, and
    -- at most every 30 minutes while editing) so mistakes can be undone by hand.
    CREATE TABLE IF NOT EXISTS history (
      hid        INTEGER PRIMARY KEY,
      id         TEXT NOT NULL,
      type       TEXT,
      data       TEXT,
      rev        INTEGER,
      updated    TEXT,
      updated_by INTEGER,
      deleted    INTEGER,
      saved      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS history_id ON history (id);
    CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT);
  `);
  return db;
}

/* ---- passwords (scrypt) ---- */
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(pw), salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function checkPassword(pw, stored) {
  const [kind, s, h] = String(stored || '').split('$');
  if (kind !== 'scrypt' || !s || !h) return false;
  const want = Buffer.from(h, 'base64');
  const got = crypto.scryptSync(String(pw), Buffer.from(s, 'base64'), want.length);
  return crypto.timingSafeEqual(want, got);
}
export const randomPassword = () => crypto.randomBytes(12).toString('base64url');
