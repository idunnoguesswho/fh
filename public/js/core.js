/* ==========================================================================
   core.js — helpers, local storage, settings, router, reusable form controls.
   Everything is attached to window.App so the other script files can share it.
   ========================================================================== */
(function () {
  'use strict';
  const App = (window.App = window.App || {});
  App.modules = {};   // form definitions, registered in modules.js
  App.docs = {};      // printable documents, registered in docs.js
  const act = (App.act = {});   // click actions, looked up through data-act="name"

  /* ------------------------------------------------------------------ helpers */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const uid = () => (window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
  const nowIso = () => new Date().toISOString();
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase();
  const num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isFinite(n) ? n : 0; };
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const money = (n) => new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n || 0);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // Local calendar date as YYYY-MM-DD (never UTC, so late-evening work lands on the right day)
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  // 28-Oct-2024 style, matching your existing PDF reports
  const fmtDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}-${MON[+m[2] - 1]}-${m[1]}` : (iso || ''); };
  const addDays = (iso, n) => { const [y, m, d] = String(iso).split('-').map(Number); const dt = new Date(y, m - 1, d + n); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`; };
  const safeName = (s) => String(s || '').replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  const nl2br = (s) => esc(s).replace(/\n/g, '<br>');
  // dot-path access: getPath(rec,'readings.r9.3')
  const getPath = (o, p) => String(p).split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  const setPath = (o, p, v) => {
    const ks = String(p).split('.'); let a = o;
    for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] == null) a[ks[i]] = /^\d+$/.test(ks[i + 1]) ? [] : {}; a = a[ks[i]]; }
    a[ks[ks.length - 1]] = v;
  };
  const deepMerge = (base, extra) => {
    for (const k of Object.keys(extra || {})) {
      if (extra[k] && typeof extra[k] === 'object' && !Array.isArray(extra[k]) && base[k] && typeof base[k] === 'object') deepMerge(base[k], extra[k]);
      else base[k] = extra[k];
    }
    return base;
  };
  const clone = (o) => JSON.parse(JSON.stringify(o));
  Object.assign(App, { $, $$, esc, pad, uid, nowIso, norm, num, round2, money, today, fmtDate, addDays, safeName, nl2br, getPath, setPath, deepMerge, clone, MON });

  /* -------------------------------------------------------------------- icons */
  const ICONS = {
    back: '<path d="M15 5l-7 7 7 7"/>',
    home: '<path d="M4 11l8-7 8 7v9h-5v-6H9v6H4z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    gear: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
    fh: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7.5 15h9"/>',
    jsa: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z"/><path d="M9 12l2 2 4-4"/>',
    veh: '<path d="M3 16V8a1 1 0 0 1 1-1h9v9M13 10h4l3 3v3h-7"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
    site: '<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    exp: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',
    inv: '<path d="M7 3h8l4 4v14H7z"/><path d="M15 3v4h4M10 12h6M10 16h6"/>',
    cust: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 20a5 5 0 0 0-3-4.5"/>',
    te: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  };
  const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  App.icon = icon;

  /* ------------------------------------------------------------ toast + modal */
  function toast(msg, ms = 2400) {
    const t = $('#toast'); if (!t) return;
    t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(() => { t.className = ''; }, ms);
  }
  function modal(html, opts = {}) {
    const m = $('#modal');
    m.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;
    m.classList.add('open');
    m.onclick = (e) => { if (e.target === m && !opts.sticky) closeModal(); };
    return m.firstElementChild;
  }
  function closeModal() { const m = $('#modal'); m.classList.remove('open'); m.innerHTML = ''; }
  function confirmBox(msg, ok = 'Delete', danger = true) {
    return new Promise((res) => {
      const s = modal(`<p>${esc(msg)}</p><div class="row end"><button class="btn" data-x="0">Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-x="1">${esc(ok)}</button></div>`, { sticky: true });
      s.onclick = (e) => { const b = e.target.closest('[data-x]'); if (b) { closeModal(); res(b.dataset.x === '1'); } };
    });
  }
  // Generic action sheet: items = [{label, icon, act, arg}]
  function menuSheet(title, items) {
    const s = modal(`<h3>${esc(title)}</h3><div class="menu">${items.map((it, i) => `<button type="button" data-i="${i}">${it.icon ? icon(it.icon) : ''}<span>${esc(it.label)}</span></button>`).join('')}</div>`);
    s.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; closeModal(); const it = items[+b.dataset.i]; if (it.fn) it.fn(); else if (it.href) location.hash = it.href; };
  }
  Object.assign(App, { toast, modal, closeModal, confirmBox, menuSheet });

  /* ------------------------------------------------------------------ storage */
  // Every record (forms, customers, settings) is stored on the ekat.ca server
  // (server/server.js) and shared by everyone who signs in. A copy is kept in a Map
  // for fast synchronous reads; each save goes straight to the server. The server
  // numbers every change (rev): saves send the rev they started from, so an edit made
  // on another device is never silently overwritten (409 -> we reload theirs).
  // Saves that fail for lack of signal are retried while the page stays open.
  const API = 'api/';
  const PERSONAL = ['tech', 'vehicle', 'tripFrom'];   // per-login parts of Settings
  const Store = (App.Store = {
    mem: new Map(), rev: new Map(), cursor: 0, user: null, queue: new Map(), retryTimer: null,
    token() { try { return localStorage.getItem('fh-token') || ''; } catch (e) { return ''; } },
    setToken(t) { try { if (t) localStorage.setItem('fh-token', t); else localStorage.removeItem('fh-token'); } catch (e) { /* ignore */ } },
    async api(method, path, body, timeoutMs = 30000) {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), timeoutMs);
      let r;
      try {
        r = await fetch(API + path, {
          method, cache: 'no-store', signal: ac.signal,
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + Store.token() },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (e) { throw Object.assign(new Error('Can’t reach the server'), { offline: true }); } finally { clearTimeout(t); }
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 && path !== 'login') { Store.setToken(''); Store.user = null; }
      if (!r.ok && r.status !== 409) throw Object.assign(new Error(data.error || 'Server error ' + r.status), { status: r.status });
      return { status: r.status, data };
    },
    // Sign in (or show "can't reach the server") until we have a user and all records.
    async init() {
      for (;;) {
        if (Store.token()) {
          try { Store.user = (await Store.api('GET', 'me')).data.user; await Store.pull(); return; }
          catch (e) { if (e.status !== 401) { await App.offlineScreen(e.message); continue; } }
        }
        await App.loginScreen();
      }
    },
    apply(w) {
      if (Ctx.rec && Ctx.rec.id === w.id && Ctx.mode === 'form') return;   // the open form resolves its own conflicts on save
      Store.rev.set(w.id, w.rev);
      if (w.deleted) Store.mem.delete(w.id); else Store.mem.set(w.id, w.data);
    },
    // Fetch everything changed since the last pull (first call loads everything).
    async pull(timeoutMs) {
      const { data } = await Store.api('GET', 'records?since=' + Store.cursor, undefined, timeoutMs);
      data.records.forEach(Store.apply);
      Store.cursor = Math.max(Store.cursor, data.rev);
      return data.records.length;
    },
    all(type) { const out = []; Store.mem.forEach((r) => { if (r.type === type) out.push(r); }); return out; },
    get(id) { return Store.mem.get(id); },
    // Resolves true when stored on the server, 'conflict' if someone else changed it first
    // (their version is loaded instead), false if it could not be sent (queued for retry).
    async save(rec) {
      rec.updated = nowIso();
      Store.mem.set(rec.id, rec);                       // synchronous so the next screen sees it immediately
      if (rec.id !== 'settings' || !Store.user) return Store.put(rec);
      // Your name, signature and vehicle belong to your login; the rest of Settings is shared.
      const mine = { id: 'settings-u' + Store.user.id, type: 'mysettings', updated: rec.updated }, shared = Object.assign({}, rec);
      PERSONAL.forEach((k) => { if (k in rec) mine[k] = rec[k]; delete shared[k]; });
      Store.mem.set(mine.id, mine);
      const a = await Store.put(shared), b = await Store.put(mine);
      return a === true ? b : a;
    },
    async put(rec) {
      try {
        const { status, data } = await Store.api('PUT', 'records/' + encodeURIComponent(rec.id), { base: Store.rev.get(rec.id) || 0, data: rec });
        Store.queue.delete(rec.id); Store.showQueue();
        if (status === 409) { Store.conflict(data.record); return 'conflict'; }
        Store.rev.set(rec.id, data.rev);
        return true;
      } catch (e) {
        if (e.status === 401) { toast('You were signed out — sign in again. Your last change was not saved.', 6000); setTimeout(() => location.reload(), 2500); return false; }
        if (e.status) { toast('Could not save: ' + e.message, 5000); return false; }
        Store.queue.set(rec.id, rec); Store.showQueue();
        clearTimeout(Store.retryTimer); Store.retryTimer = setTimeout(Store.retry, 15000);
        return false;
      }
    },
    async retry() {
      for (const rec of Array.from(Store.queue.values())) { if ((await Store.put(rec)) === false) return; }
      toast('Back online — all changes saved');
    },
    showQueue() { const n = Store.queue.size; if (n) setSaved(`Not saved — no connection (${n} waiting)`); },
    conflict(w) {
      Store.rev.set(w.id, w.rev);
      if (w.deleted) Store.mem.delete(w.id); else Store.mem.set(w.id, w.data);
      toast('Someone else changed this record — showing their latest version.', 5000);
      if (Ctx.rec && Ctx.rec.id === w.id) { Ctx.dirty = false; Ctx.rec = null; setTimeout(App.go, 50); }
    },
    async del(id) {
      const old = Store.mem.get(id);
      Store.mem.delete(id);
      try {
        const { status, data } = await Store.api('DELETE', 'records/' + encodeURIComponent(id) + '?base=' + (Store.rev.get(id) || 0));
        if (status === 409) { Store.conflict(data.record); return false; }
        Store.rev.set(id, data.rev);
        return true;
      } catch (e) {
        if (old) Store.mem.set(id, old);
        toast('Could not delete — ' + e.message, 4500);
        return false;
      }
    },
    // Records saved in this browser by the old, device-only version of the app.
    legacy() {
      return new Promise((res) => {
        try {
          const rq = indexedDB.open('dshc-field');
          rq.onupgradeneeded = () => { rq.transaction.abort(); res([]); };   // never existed here
          rq.onerror = () => res([]);
          rq.onsuccess = () => {
            const d = rq.result;
            if (!d.objectStoreNames.contains('records')) { d.close(); res([]); return; }
            const g = d.transaction('records').objectStore('records').getAll();
            g.onsuccess = () => { d.close(); res(g.result || []); };
            g.onerror = () => { d.close(); res([]); };
          };
        } catch (e) { res([]); }
      });
    },
  });
  window.addEventListener('beforeunload', (e) => { if (Store.queue.size) { e.preventDefault(); e.returnValue = ''; } });

  // Sign-in and "no connection" screens shown by Store.init()
  App.loginScreen = (msg) => new Promise((done) => {
    $('#tabs').innerHTML = ''; $('#title').textContent = 'Field Forms'; $('#back').hidden = true;
    $('#view').innerHTML = `<form class="card pad" id="login" style="max-width:420px;margin:1.5rem auto">` +
      `<h3 style="margin-top:0">Sign in</h3><p class="muted small">Forms are stored on the DSHC server and shared with everyone who signs in.</p>` +
      `<label class="fld"><span>Email</span><input type="email" name="email" autocomplete="username" required></label>` +
      `<label class="fld"><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>` +
      `<p class="small" id="loginmsg" role="alert" style="color:var(--bad)">${esc(msg || '')}</p>` +
      `<button class="btn primary block">Sign in</button></form>`;
    const f = $('#login');
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector('button'); btn.disabled = true;
      try {
        const { data } = await Store.api('POST', 'login', { email: f.email.value, password: f.password.value });
        Store.setToken(data.token); done();
      } catch (err) { $('#loginmsg').textContent = err.message; btn.disabled = false; }
    };
  });
  App.offlineScreen = (msg) => new Promise((done) => {
    $('#tabs').innerHTML = '';
    $('#view').innerHTML = `<div class="card pad" style="max-width:420px;margin:1.5rem auto"><h3 style="margin-top:0">${esc(msg)}</h3>` +
      `<p class="muted">Your forms are stored on the server, so this app needs a connection. Check your signal and try again.</p>` +
      `<button class="btn primary block" id="retry">Try again</button></div>`;
    $('#retry').onclick = done;
  });

  /* ----------------------------------------------------------------- settings */
  // Your business details are NOT in the source code. They are stored on the server
  // (Settings page) so the site can be hosted publicly without exposing them.
  // Name, signature and vehicle are kept per login in a 'settings-u<id>' record.
  const DEFAULTS = {
    id: 'settings', type: 'settings',
    company: { name: 'DS Home Computing Ltd.', tagline: 'Happy to be of service', address: '', phone: '', email: '', web: 'dshome.ca', taxNo: '', logo: '' },
    tech: { name: '', email: '', sig: '' },
    vehicle: { desc: '', plate: '', ownership: '' }, tripFrom: '',
    inv: {
      nextNo: 1210, taxLabel: 'GST', taxRate: 5, termsDays: 0, fhPrice: 95, hourly: 0,
      notes: "If you like our service, tell others. If you don't tell us, we will make it right.", payment: '',
    },
    rates: { km: 0.54 },
    fh: { minFpm: 80, maxFpm: 100 },
    counters: { jsa: 0, veh: 0, site: 0 },
    lastBackup: '',
  };
  const Settings = (App.Settings = {
    get() { return deepMerge(deepMerge(clone(DEFAULTS), Store.get('settings') || {}), (Store.user && Store.get('settings-u' + Store.user.id)) || {}); },
    set(path, value) { const s = Settings.get(); setPath(s, path, value); return Store.save(s); },
    bump(counter) { const s = Settings.get(); s.counters[counter] = (s.counters[counter] || 0) + 1; return Store.save(s); },
  });

  /* ------------------------------------------------------- form state + engine */
  // Ctx describes the page currently open for editing. Inputs carry data-f="dot.path"
  // and are written straight into Ctx.rec; changes autosave after a short pause.
  const Ctx = (App.Ctx = { mode: null, mod: null, rec: null, dirty: false, timer: null, closed: new Set(), pending: {} });

  function setSaved(t) { const s = $('#saved'); if (s) s.textContent = t || ''; }
  function changed(path) {
    if (!Ctx.rec) return;
    if (Ctx.mod && Ctx.mod.onChange) Ctx.mod.onChange(Ctx.rec, path);
    Ctx.dirty = true; setSaved('Saving…');
    clearTimeout(Ctx.timer); Ctx.timer = setTimeout(flush, 500);
  }
  async function flush() {
    clearTimeout(Ctx.timer);
    const r = Ctx.rec; if (!r || !Ctx.dirty) return;
    Ctx.dirty = false;
    const first = !Store.get(r.id);
    const ok = await Store.save(r);
    if (ok === 'conflict') return;                  // the other device's version is being shown instead
    delete Ctx.pending[r.id];
    if (first && Ctx.mod && Ctx.mod.afterFirstSave) Ctx.mod.afterFirstSave(r);
    if (ok) setSaved('Saved ✓'); else if (!Store.queue.size) setSaved('Not saved');
  }
  // Force-save even when nothing was typed (e.g. user taps Preview on a brand-new form)
  async function saveNow() { if (Ctx.rec) { Ctx.dirty = true; await flush(); } }
  Object.assign(App, { changed, flush, saveNow, setSaved });

  function renderForm() {
    const mod = Ctx.mod, r = Ctx.rec, y = window.scrollY;
    $('#view').innerHTML = `<div class="form">${mod.form(r)}</div>${mod.bar ? `<div class="actionbar">${mod.bar(r)}</div>` : ''}`;
    if (mod.after) mod.after(r);
    window.scrollTo(0, y);
  }
  App.renderForm = renderForm;

  /* ---- reusable controls (return HTML strings; r = the record being edited) ---- */
  const C = (App.C = {});
  C.text = (label, path, r, o = {}) =>
    `<label class="fld ${o.cls || ''}"><span>${esc(label)}</span><input data-f="${path}" type="${o.type || 'text'}" value="${esc(getPath(r, path))}"` +
    `${o.list ? ` list="${o.list}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}${o.mode ? ` inputmode="${o.mode}"` : ''}${o.step ? ` step="${o.step}"` : ''}${o.ro ? ' readonly' : ''} autocomplete="off"></label>`;
  C.num = (label, path, r, o = {}) => C.text(label, path, r, Object.assign({}, o, { type: 'number', mode: 'decimal', step: o.step || 'any' }));
  C.date = (label, path, r, o = {}) => C.text(label, path, r, Object.assign({}, o, { type: 'date' }));
  C.time = (label, path, r, o = {}) => C.text(label, path, r, Object.assign({}, o, { type: 'time' }));
  C.area = (label, path, r, o = {}) =>
    `<label class="fld ${o.cls || ''}"><span>${esc(label)}</span><textarea data-f="${path}" rows="${o.rows || 3}"${o.ph ? ` placeholder="${esc(o.ph)}"` : ''}>${esc(getPath(r, path))}</textarea></label>`;
  C.sel = (label, path, r, opts, o = {}) => {
    const v = getPath(r, path) == null ? '' : getPath(r, path);
    return `<label class="fld ${o.cls || ''}"><span>${esc(label)}</span><select data-f="${path}"><option value=""></option>` +
      opts.map((op) => { const [val, lab] = Array.isArray(op) ? op : [op, op]; return `<option value="${esc(val)}"${val === v ? ' selected' : ''}>${esc(lab)}</option>`; }).join('') + '</select></label>';
  };
  C.chk = (label, path, r) => `<label class="chk"><input type="checkbox" data-f="${path}"${getPath(r, path) ? ' checked' : ''}><span>${esc(label)}</span></label>`;
  const TONE = { Good: 't-ok', Fair: 't-warn', Poor: 't-bad', 'N/A': 't-na', ok: 't-ok', defect: 't-bad', na: 't-na', Yes: 't-ok', No: 't-bad', Low: 't-ok', Medium: 't-warn', High: 't-bad', Paid: 't-ok', Sent: 't-warn', OK: 't-ok', Issue: 't-bad', 'Needs Repair': 't-bad', Owned: 't-na', Rented: 't-na' };
  // Segmented choice. Tap the selected button again to clear it.
  C.seg = (label, path, r, opts, o = {}) => {
    const cur = getPath(r, path);
    const btns = opts.map((op) => { const [v, l] = Array.isArray(op) ? op : [op, op]; const on = cur === v; return `<button type="button" class="${on ? 'on ' + (TONE[v] || '') : ''}" data-v="${esc(v)}" role="radio" aria-checked="${on}">${esc(l)}</button>`; }).join('');
    const grp = `<div class="seg ${o.mini ? 'mini' : ''}" role="radiogroup" data-seg="${path}" data-tone="1">${btns}</div>`;
    return label ? `<div class="fld"><span>${esc(label)}</span>${grp}</div>` : grp;
  };
  // Text box with one-tap chips that fill it in (e.g. Good / Poor / N/A)
  C.quick = (label, path, r, chips, o = {}) =>
    `<div class="fld ${o.cls || ''}"><span>${esc(label)}</span><input data-f="${path}" type="text" value="${esc(getPath(r, path))}" aria-label="${esc(label)}"${o.list ? ` list="${o.list}"` : ''}${o.ph ? ` placeholder="${esc(o.ph)}"` : ''} autocomplete="off">` +
    `<div class="chips">${chips.map((c) => `<button type="button" class="chip" data-set="${path}" data-v="${esc(c)}">${esc(c)}</button>`).join('')}</div></div>`;
  // Chips that append a phrase to a textarea (used for common deficiencies)
  C.addChips = (path, phrases) => `<div class="chips">${phrases.map((p) => `<button type="button" class="chip" data-addto="${path}" data-v="${esc(p)}">+ ${esc(p)}</button>`).join('')}</div>`;
  C.sig = (label, path, r) => {
    const v = getPath(r, path);
    return `<div class="fld"><span>${esc(label)}</span><div class="sig-box" data-sig="${path}" role="button" tabindex="0">${v ? `<img src="${v}" alt="Signature">` : '<em>Tap to sign</em>'}</div>` +
      `${v ? `<button type="button" class="link" data-act="sigClear" data-path="${path}">Clear signature</button>` : ''}</div>`;
  };
  const photoGrid = (path, r) => {
    const list = getPath(r, path) || [];
    return list.map((src, i) => `<div class="ph"><img src="${src}" alt="Photo ${i + 1}" data-act="photoView" data-path="${path}" data-i="${i}"><button type="button" data-act="photoDel" data-path="${path}" data-i="${i}" aria-label="Remove photo">×</button></div>`).join('') +
      `<label class="addph">+ Photo<input type="file" accept="image/*" multiple hidden data-photo="${path}"></label>`;
  };
  C.photos = (label, path, r) => `<div class="fld"><span>${esc(label)}</span><div class="photos" data-photos="${path}">${photoGrid(path, r)}</div></div>`;
  C.sec = (id, title, inner, o = {}) =>
    `<details class="card" data-sec="${id}"${Ctx.closed.has(id) ? '' : ' open'}><summary>${esc(title)}${o.badge ? `<em>${o.badge}</em>` : ''}</summary><div class="body">${inner}</div></details>`;

  /* ---- event delegation for all form controls ---- */
  const view = () => $('#view');
  function onInput(e) {
    const t = e.target;
    if (Ctx.mode !== 'form' || !t.dataset || !t.dataset.f) return;
    setPath(Ctx.rec, t.dataset.f, t.type === 'checkbox' ? t.checked : t.value);
    changed(t.dataset.f);
  }
  function resizeImage(file, max, q, type) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); res(c.toDataURL(type || 'image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Not an image')); };
      img.src = url;
    });
  }
  App.resizeImage = resizeImage;

  async function onChange(e) {
    const t = e.target;
    if (t.matches && t.matches('input[data-photo]') && Ctx.mode === 'form') {         // add photos (compressed to keep storage small)
      const path = t.dataset.photo; const arr = getPath(Ctx.rec, path) || [];
      for (const f of Array.from(t.files || [])) { try { arr.push(await resizeImage(f, 1280, 0.72)); } catch (err) { toast('Could not read that photo'); } }
      setPath(Ctx.rec, path, arr); changed(path);
      const box = $(`[data-photos="${path}"]`); if (box) box.innerHTML = photoGrid(path, Ctx.rec);
      return;
    }
    onInput(e);
  }

  function openSignature(path) {
    const s = modal('<h3>Sign here</h3><canvas id="sigc" class="sigc"></canvas><div class="row end" style="margin-top:.7rem"><button class="btn" data-x="clear">Clear</button><button class="btn" data-x="cancel">Cancel</button><button class="btn primary" data-x="ok">Use signature</button></div>', { sticky: true });
    const cv = $('#sigc', s), w = cv.clientWidth || 320, h = 180, dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr); ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#111';
    let drawing = false, any = false, last = [0, 0];
    const pos = (e) => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    cv.addEventListener('pointerdown', (e) => { drawing = true; any = true; last = pos(e); try { cv.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(last[0] + 0.1, last[1]); ctx.stroke(); });
    cv.addEventListener('pointermove', (e) => { if (!drawing) return; const p = pos(e); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => cv.addEventListener(t, () => { drawing = false; }));
    s.onclick = (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return; const x = b.dataset.x;
      if (x === 'clear') { ctx.clearRect(0, 0, w, h); any = false; }
      else if (x === 'cancel') closeModal();
      else if (x === 'ok') { if (!any) { toast('Please sign first'); return; } setPath(Ctx.rec, path, cv.toDataURL('image/png')); closeModal(); changed(path); renderForm(); }
    };
  }

  document.addEventListener('click', (e) => {
    // 1. named actions: <button data-act="name" data-arg="...">
    const a = e.target.closest('[data-act]');
    if (a && act[a.dataset.act]) { if (a.tagName === 'A' && !a.getAttribute('href')) e.preventDefault(); act[a.dataset.act](a, e); return; }
    if (Ctx.mode !== 'form') return;
    // 2. segmented buttons
    const sb = e.target.closest('.seg button');
    if (sb && sb.parentElement.dataset.seg) {
      const path = sb.parentElement.dataset.seg, val = getPath(Ctx.rec, path) === sb.dataset.v ? '' : sb.dataset.v;
      setPath(Ctx.rec, path, val);
      $$('button', sb.parentElement).forEach((x) => {
        const on = x.dataset.v === val && val !== '';
        x.className = on ? 'on ' + (TONE[x.dataset.v] || '') : ''; x.setAttribute('aria-checked', on);
      });
      changed(path); return;
    }
    // 3. fill-in chips
    const ch = e.target.closest('[data-set]');
    if (ch) { const inp = $(`[data-f="${ch.dataset.set}"]`, view()); if (inp) inp.value = ch.dataset.v; setPath(Ctx.rec, ch.dataset.set, ch.dataset.v); changed(ch.dataset.set); return; }
    // 4. append-text chips
    const ad = e.target.closest('[data-addto]');
    if (ad) {
      const path = ad.dataset.addto, cur = String(getPath(Ctx.rec, path) || '');
      if (cur.toLowerCase().includes(ad.dataset.v.toLowerCase())) { toast('Already added'); return; }
      const next = cur ? cur.replace(/\s+$/, '') + '\n' + ad.dataset.v : ad.dataset.v;
      setPath(Ctx.rec, path, next); const ta = $(`[data-f="${path}"]`, view()); if (ta) ta.value = next; changed(path); return;
    }
    // 5. signature pad
    const sg = e.target.closest('[data-sig]');
    if (sg) openSignature(sg.dataset.sig);
  });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('[data-sig]')) { e.preventDefault(); openSignature(e.target.dataset.sig); } });

  act.sigClear = (el) => { setPath(Ctx.rec, el.dataset.path, ''); changed(el.dataset.path); renderForm(); };
  act.photoDel = (el) => { const p = el.dataset.path, arr = getPath(Ctx.rec, p) || []; arr.splice(+el.dataset.i, 1); setPath(Ctx.rec, p, arr); changed(p); const box = $(`[data-photos="${p}"]`); if (box) box.innerHTML = photoGrid(p, Ctx.rec); };
  act.photoView = (el) => { const src = el.getAttribute('src'); const s = modal(`<img src="${src}" alt="" style="width:100%;border-radius:10px"><div class="row end" style="margin-top:.6rem"><button class="btn" data-x="1">Close</button></div>`); s.onclick = (e) => { if (e.target.closest('[data-x]')) closeModal(); }; };
  act.noop = () => {};

  // Keep collapsed/expanded state of sections when the form re-renders (toggle doesn't bubble → capture)
  document.addEventListener('toggle', (e) => {
    const d = e.target; if (!d.matches || !d.matches('details[data-sec]')) return;
    if (d.open) Ctx.closed.delete(d.dataset.sec); else Ctx.closed.add(d.dataset.sec);
  }, true);

  document.addEventListener('input', (e) => { if (e.target.closest && e.target.closest('#view')) onInput(e); });
  document.addEventListener('change', (e) => { if (e.target.closest && e.target.closest('#view')) onChange(e); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', () => { flush(); });

  /* -------------------------------------------------------------------- router */
  const routes = [];
  App.route = (re, fn) => routes.push([re, fn]);
  App.setHeader = ({ title, back }) => {
    $('#title').textContent = title || 'Field Forms';
    document.title = (title ? title + ' · ' : '') + 'DSHC Field Forms';
    const b = $('#back');
    if (back) { b.hidden = false; b.innerHTML = icon('back'); b.onclick = () => { location.hash = back; }; } else { b.hidden = true; }
  };
  async function go() {
    await flush();                                  // never lose edits when navigating
    closeModal(); setSaved(''); Store.showQueue();
    document.body.classList.remove('formmode');
    Ctx.mode = null; Ctx.rec = null; Ctx.mod = null;
    // Pick up changes made on other devices (quick; skipped when there's no signal)
    try { await Store.pull(5000); } catch (e) { if (e.status === 401) { location.reload(); return; } }
    const h = location.hash || '#/home';
    for (const [re, fn] of routes) {
      const m = re.exec(h);
      if (!m) continue;
      try { await fn(...m.slice(1).map((x) => (x ? decodeURIComponent(x) : x))); }
      catch (err) { console.error(err); $('#view').innerHTML = `<div class="card pad"><p><b>Something went wrong.</b></p><p class="muted small">${esc(err.message)}</p><a class="btn" href="#/home">Back to home</a></div>`; }
      if (App.onRoute) App.onRoute(h);
      window.scrollTo(0, 0);
      return;
    }
    location.replace('#/home');
  }
  window.addEventListener('hashchange', go);
  App.go = go;

  // Open a record in the editor ("new" creates it in memory; it is only stored once you type something)
  App.route(/^#\/new\/(\w+)(?:\?(.*))?$/, async (type, q) => {
    const mod = App.modules[type]; if (!mod) { location.replace('#/home'); return; }
    const rec = mod.blank(new URLSearchParams(q || ''));
    Ctx.pending[rec.id] = rec;
    location.replace('#/edit/' + type + '/' + rec.id);
  });
  App.route(/^#\/edit\/(\w+)\/([\w-]+)$/, async (type, id) => {
    const mod = App.modules[type], rec = Store.get(id) || Ctx.pending[id];
    if (!mod || !rec) { toast('That record was not found'); location.replace('#/home'); return; }
    Ctx.mod = mod; Ctx.rec = rec; Ctx.mode = 'form'; Ctx.dirty = false; Ctx.closed = new Set(mod.collapsed || []);   // long forms open with only the first section expanded
    document.body.classList.add('formmode');
    App.setHeader({ title: mod.name, back: (mod.backHash && mod.backHash(rec)) || mod.listHash || '#/list/' + type });
    renderForm();
  });
  App.route(/^#\/view\/(\w+)\/([\w-]+)$/, async (type, id) => {
    const mod = App.modules[type], rec = Store.get(id);
    if (!mod || !rec) { toast('That record was not found'); location.replace('#/home'); return; }
    Ctx.mode = 'view';
    App.setHeader({ title: mod.name + ' — preview', back: '#/edit/' + type + '/' + id });
    const fname = App.safeName(mod.fileName ? mod.fileName(rec) : mod.name);
    $('#view').innerHTML =
      `<div class="toolbar"><a class="btn" href="#/edit/${type}/${id}">Edit</a>` +
      `<button class="btn primary" data-act="print" data-name="${esc(fname)}">Print / Save PDF</button>` +
      `<a class="btn" href="${esc(mod.mailto ? mod.mailto(rec) : '#')}" ${mod.mailto ? '' : 'hidden'}>Email</a></div>` +
      `<div class="paper">${mod.doc(rec)}</div>`;
  });
  // Print (on Android/Chrome choose "Save as PDF"); the document title becomes the file name
  act.print = (el) => {
    const old = document.title; document.title = el.dataset.name || old;
    const restore = () => { document.title = old; window.removeEventListener('afterprint', restore); };
    window.addEventListener('afterprint', restore); setTimeout(restore, 8000);
    window.print();
  };
})();
