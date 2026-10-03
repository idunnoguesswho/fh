/* ==========================================================================
   main.js — pages (home, lists, time & expenses, reports, settings), backup,
   bottom navigation and start-up.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { $, $$, esc, uid, nowIso, norm, num, round2, money, today, fmtDate, addDays, pad, safeName, toast, modal, closeModal, confirmBox, menuSheet, icon, C, Store, Settings, Ctx, act, route, setHeader } = App;
  const M = App.modules;
  const view = () => $('#view');

  /* --------------------------------------------------------------- helpers */
  const itemRow = (mod, r, withDots = true) => {
    const it = mod.item(r);
    return `<div class="item" data-q="${esc(norm(it.title + ' ' + it.sub))}"><a class="main" href="#/edit/${mod.key}/${r.id}"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></a>` +
      `${it.badge ? `<span class="pill ${it.badge.cls}">${esc(it.badge.text)}</span>` : ''}${withDots ? `<button type="button" class="dots" data-act="rowMenu" data-type="${mod.key}" data-id="${r.id}" aria-label="More actions">⋯</button>` : ''}</div>`;
  };
  const sortRecs = (type, recs) => recs.map((r) => ({ r, it: M[type].item(r) })).sort((a, b) => {
    if (type === 'cust') return norm(a.r.name).localeCompare(norm(b.r.name));
    return String(b.it.date || '').localeCompare(String(a.it.date || '')) || String(b.r.updated || '').localeCompare(String(a.r.updated || ''));
  }).map((x) => x.r);
  const mondayOf = (iso) => { const [y, m, d] = iso.split('-').map(Number), dt = new Date(y, m - 1, d); const off = (dt.getDay() + 6) % 7; return addDays(iso, -off); };
  const download = (name, text, mime) => {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  };

  /* ------------------------------------------------------------------ home */
  route(/^#\/home$/, async () => {
    setHeader({ title: 'DSHC Field Forms' });
    const s = Settings.get();
    const tiles = [['visit', 'Site visits + PDFs', '#/list/visit', 'site'], ['fh', 'Fume Hood Inspection', '#/list/fh', 'fh'], ['jsa', 'Job Safety Analysis', '#/list/jsa', 'jsa'], ['veh', 'Vehicle Inspection', '#/list/veh', 'veh'], ['site', 'Site Inspection', '#/list/site', 'site'],
      ['time', 'Time & Expenses', '#/time', 'time'], ['inv', 'Invoices', '#/list/inv', 'inv'], ['cust', 'Customers', '#/list/cust', 'cust']];
    const tileHtml = tiles.map(([k, label, href, ic]) => {
      let sub = '';
      if (k === 'time') { const n = Store.all('time').length + Store.all('exp').length; sub = n ? n + ' entries' : 'Hours, km, receipts'; }
      else { const n = Store.all(k).length, d = Store.all(k).filter((r) => r.status === 'draft').length; sub = n ? n + (k === 'cust' ? ' saved' : ' total') + (d && k !== 'cust' ? ` · ${d} draft${d > 1 ? 's' : ''}` : '') : 'None yet'; }
      return `<a class="tile" href="${href}">${icon(ic)}<b>${label}</b><small>${esc(sub)}</small></a>`;
    }).join('') + `<a class="tile primary" href="#/new/visit">${icon('plus')}<b>Start site visit</b><small>All forms in one go</small></a>`;

    // unbilled work summary
    const fh = Store.all('fh').filter((x) => x.status === 'final' && !x.billedTo).length;
    const hrs = Store.all('time').filter((x) => x.billable !== false && !x.billedTo).reduce((a, x) => a + num(x.hours), 0);
    const exp = Store.all('exp').filter((x) => x.billable !== false && !x.billedTo).reduce((a, x) => a + num(x.amount), 0);
    const unbilled = (fh || hrs || exp) ? `<div class="card pad"><b>Ready to invoice</b><div class="stats"><span class="stat">${fh} inspection${fh === 1 ? '' : 's'}</span><span class="stat">${round2(hrs)} h</span><span class="stat">${money(exp)} expenses</span></div><div style="margin-top:.6rem"><a class="btn primary sm" href="#/new/inv">Create invoice</a></div></div>` : '';

    // drafts to resume
    const drafts = [];
    ['visit', 'fh', 'jsa', 'veh', 'site', 'inv'].forEach((t) => Store.all(t).filter((r) => r.status === 'draft').forEach((r) => drafts.push({ t, r })));
    drafts.sort((a, b) => String(b.r.updated).localeCompare(String(a.r.updated)));
    const draftHtml = drafts.length ? '<h3>Pick up where you left off</h3>' + drafts.slice(0, 5).map((d) => itemRow(M[d.t], d.r, false)).join('') : '';

    // gentle reminders
    const notes = [];
    if (!s.company.address || !s.company.phone) notes.push('Add your business address, phone and tax number in <a href="#/settings">Settings</a> so they print on reports and invoices.');
    const anyData = Store.mem.size > 1;
    const days = s.lastBackup ? (Date.now() - new Date(s.lastBackup).getTime()) / 86400000 : Infinity;
    if (anyData && days > 30) notes.push(`${s.lastBackup ? 'Last backup was ' + Math.floor(days) + ' days ago.' : 'You have not backed up yet.'} Your forms are on the server; keep your own copy too — <button class="link" data-act="exportAll">back up now</button>.`);
    if (App.legacyCount) notes.push(`This device still has ${App.legacyCount} record${App.legacyCount === 1 ? '' : 's'} saved before the switch to the server. <button class="link" data-act="uploadLocal">Upload them now</button>.`);
    const noteHtml = notes.map((n) => `<div class="hint warn">${n}</div>`).join('');

    view().innerHTML = noteHtml + `<div class="tiles">${tileHtml}</div>` + unbilled + draftHtml;
  });

  /* ----------------------------------------------------------------- lists */
  route(/^#\/list\/(\w+)$/, async (type) => {
    const mod = M[type]; if (!mod) { location.replace('#/home'); return; }
    setHeader({ title: mod.plural, back: '#/home' });
    const recs = sortRecs(type, Store.all(type));
    view().innerHTML =
      (recs.length > 6 ? '<input class="search" type="text" id="q" placeholder="Search…" aria-label="Search" autocomplete="off">' : '') +
      (type === 'fh' ? `<div class="row" style="margin-bottom:.7rem"><a class="btn sm" href="#/settings#data">Import / export CSV</a></div>` : '') +
      (recs.length ? recs.map((r) => itemRow(mod, r)).join('') : `<div class="empty">${icon(mod.icon, '')}<p>No ${esc(mod.plural.toLowerCase())} yet.</p></div>`) +
      `<div class="fab"><a class="btn primary" href="#/new/${type}">+ New</a></div>`;
    const q = $('#q'); if (q) q.oninput = () => { const t = norm(q.value); $$('.item', view()).forEach((el) => { el.hidden = t && !el.dataset.q.includes(t); }); };
  });

  // ⋯ menu on each row
  act.rowMenu = (el) => {
    const type = el.dataset.type, id = el.dataset.id, mod = M[type], r = Store.get(id); if (!r) return;
    menuSheet(mod.item(r).title, [
      { label: 'Open', fn: () => { location.hash = `#/edit/${type}/${id}`; } },
      { label: type === 'visit' ? 'Make PDFs' : 'Preview / Save PDF', fn: () => { location.hash = type === 'visit' ? `#/pack/${id}` : `#/view/${type}/${id}`; } },
      { label: 'Duplicate', fn: () => duplicate(type, r) },
      { label: 'Delete', fn: async () => { if (await confirmBox(`Delete “${mod.item(r).title}”? This cannot be undone.`)) { if (mod.onDelete) await mod.onDelete(r); await Store.del(id); toast('Deleted'); App.go(); } } },
    ]);
  };
  function duplicate(type, r) {
    const n = JSON.parse(JSON.stringify(r)); n.id = uid(); n.created = nowIso(); delete n.billedTo; delete n.legacyId; delete n.pdfAt; delete n.expId;
    if (type === 'visit') {                                         // same site again: keep site, vehicle and trip start; clear the day's answers
      const b = M.visit.blank(); ['customer', 'projectName', 'address', 'contractNo', 'clientProjNo', 'owner', 'clientRep', 'supervisor', 'workArea', 'task', 'tech', 'vehicle', 'purpose'].forEach((k) => { b[k] = n[k]; });
      b.legs[0].from = n.legs[0].from; b.legs[0].to = n.legs[0].to; b.flha.haz = n.flha.haz; b.flha.steps = n.flha.steps; b.flha.firstAid = n.flha.firstAid; b.flha.fireExt = n.flha.fireExt; b.flha.muster = n.flha.muster; b.flha.emergNo = n.flha.emergNo;
      Object.keys(b).forEach((k) => { n[k] = b[k]; });
    } else if (type === 'jsa') { n.jsaNo = M.jsa.blank().jsaNo; n.date = today(); n.status = 'draft'; n.reviewed = n.fit = n.stopWork = false; (n.crew || []).forEach((c) => { c.sig = ''; }); }
    else if (type === 'inv') { const b = M.inv.blank(); n.number = b.number; n.date = b.date; n.due = b.due; n.status = 'draft'; n.paidDate = ''; n.links = { fh: [], time: [], exp: [] }; }
    else if (type === 'fh') { n.status = 'draft'; n.fhId = ''; n.serial = ''; n.sigTech = ''; n.sigClient = ''; n.photos = []; n.issued = n.completed = today(); }
    else if (type === 'veh' || type === 'site') { n.status = 'draft'; n.date = today(); n.sigDriver = n.sigInspector = n.sigRep = ''; }
    else if (type === 'time' || type === 'exp') { n.date = today(); }
    Ctx.pending[n.id] = n; location.hash = `#/edit/${type}/${n.id}`;
  }

  /* -------------------------------------------------- time & expenses page */
  route(/^#\/time(?:\?(.*))?$/, async (q) => {
    const p = new URLSearchParams(q || ''), tab = p.get('tab') || 'time';
    setHeader({ title: 'Time & Expenses', back: '#/home' });
    const tabs = `<div class="seg" style="margin-bottom:.8rem">${[['time', 'Time'], ['exp', 'Expenses'], ['rep', 'Reports']].map(([k, l]) => `<button type="button" class="${tab === k ? 'on' : ''}" data-act="teTab" data-t="${k}">${l}</button>`).join('')}</div>`;
    let body = '';
    if (tab === 'time' || tab === 'exp') {
      const mod = M[tab], recs = Store.all(tab).sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.created).localeCompare(String(a.created)));
      const days = {}; recs.forEach((r) => { (days[r.date] = days[r.date] || []).push(r); });
      body = Object.keys(days).sort().reverse().map((d) => {
        const tot = days[d].reduce((a, r) => a + num(tab === 'time' ? r.hours : r.amount), 0);
        return `<div class="daygroup"><span>${esc(fmtDate(d))}</span><span>${tab === 'time' ? round2(tot) + ' h' : money(tot)}</span></div>` + days[d].map((r) => itemRow(mod, r)).join('');
      }).join('') || `<div class="empty">${icon(tab)}<p>No ${tab === 'time' ? 'time' : 'expense'} entries yet.</p></div>`;
      body += `<div class="fab"><a class="btn primary" href="#/new/${tab}">+ ${tab === 'time' ? 'Time' : 'Expense'}</a></div>`;
    } else {
      const from = p.get('from') || mondayOf(today()), to = p.get('to') || today();
      body = `<datalist id="dl-cust">${Store.all('cust').map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>` +
        `<div class="card pad"><h3>Time &amp; expense report</h3>` +
        `<div class="row" style="margin-bottom:.6rem"><button class="chip" data-act="rangeSet" data-r="week">This week</button><button class="chip" data-act="rangeSet" data-r="lastweek">Last week</button><button class="chip" data-act="rangeSet" data-r="month">This month</button></div>` +
        `<div class="grid2"><label class="fld"><span>From</span><input type="date" id="r-from" value="${from}"></label><label class="fld"><span>To</span><input type="date" id="r-to" value="${to}"></label></div>` +
        `<label class="fld"><span>Customer (optional)</span><input type="text" id="r-cust" list="dl-cust" autocomplete="off"></label>` +
        `<button class="btn primary block" data-act="repTE">Open report</button></div>` +
        `<div class="card pad"><h3>Daily work log</h3><p class="muted small">Builds your Daily Work Log sheet from the time entries for one day.</p>` +
        `<div class="grid2"><label class="fld"><span>Date worked</span><input type="date" id="l-date" value="${today()}"></label><label class="fld"><span>Job number (optional)</span><input type="text" id="l-job"></label></div>` +
        `<label class="fld"><span>Customer / “To” (optional)</span><input type="text" id="l-cust" list="dl-cust" autocomplete="off"></label>` +
        `<button class="btn primary block" data-act="repLog">Open daily work log</button></div>`;
    }
    view().innerHTML = tabs + body;
  });
  act.teTab = (el) => { location.hash = '#/time?tab=' + el.dataset.t; };
  act.rangeSet = (el) => {
    const t = today(), w = mondayOf(t); let f, e;
    if (el.dataset.r === 'week') { f = w; e = t; }
    else if (el.dataset.r === 'lastweek') { f = addDays(w, -7); e = addDays(w, -1); }
    else { f = t.slice(0, 8) + '01'; e = t; }
    $('#r-from').value = f; $('#r-to').value = e;
  };
  act.repTE = () => { location.hash = '#/report/te?' + new URLSearchParams({ from: $('#r-from').value, to: $('#r-to').value, cust: $('#r-cust').value }).toString(); };
  act.repLog = () => { location.hash = '#/report/log?' + new URLSearchParams({ date: $('#l-date').value, job: $('#l-job').value, cust: $('#l-cust').value }).toString(); };

  route(/^#\/report\/(te|log)\?(.*)$/, async (kind, q) => {
    const p = Object.fromEntries(new URLSearchParams(q));
    setHeader({ title: kind === 'te' ? 'Time & expense report' : 'Daily work log', back: '#/time?tab=rep' });
    Ctx.mode = 'view';
    const name = kind === 'te' ? `Time_Expense_${p.from}_to_${p.to}` : `Daily_Work_Log_${p.date}`;
    view().innerHTML = `<div class="toolbar"><button class="btn primary" data-act="print" data-name="${esc(safeName(name))}">Print / Save PDF</button></div><div class="paper">${App.docs[kind](p)}</div>`;
  });

  /* ------------------------------------------------------------- settings */
  const settingsMod = {
    key: 'settings', name: 'Settings', listHash: '#/home',
    form(r) {
      const count = (t) => Store.all(t).length;
      return C.sec('biz', 'Your business (prints on reports and invoices)',
        `${C.text('Business name', 'company.name', r)}${C.text('Tagline', 'company.tagline', r)}${C.area('Address', 'company.address', r, { rows: 3 })}` +
        `<div class="grid2">${C.text('Phone', 'company.phone', r, { type: 'tel' })}${C.text('Email', 'company.email', r, { type: 'email' })}${C.text('Website', 'company.web', r)}${C.text('GST / tax number', 'company.taxNo', r)}</div>` +
        `<div class="fld"><span>Logo</span>${r.company.logo ? `<img src="${r.company.logo}" alt="Logo" style="max-height:60px;display:block;margin-bottom:.4rem;background:#fff;padding:4px;border-radius:6px">` : ''}` +
        `<div class="row"><label class="btn sm">Upload logo<input type="file" accept="image/*" hidden id="logoin"></label>${r.company.logo ? '<button type="button" class="btn sm" data-act="logoClear">Remove</button>' : ''}</div></div>`) +
        C.sec('tech', 'Technician defaults', `<div class="grid2">${C.text('Your name (on reports)', 'tech.name', r)}${C.text('Your email', 'tech.email', r, { type: 'email' })}</div>${C.sig('Your saved signature (auto-applied to every form)', 'tech.sig', r)}`) +
        C.sec('veh', 'Vehicle and trip defaults (pre-fill each visit)', `<div class="grid2">${C.text('Vehicle make / model / year', 'vehicle.desc', r)}${C.text('Licence plate', 'vehicle.plate', r)}</div>${C.seg('Ownership', 'vehicle.ownership', r, ['Owned', 'Rented'])}${C.text('Usual starting point (trip “from”)', 'tripFrom', r)}`) +
        C.sec('inv', 'Invoicing and rates',
          `<div class="grid2">${C.num('Next invoice number', 'inv.nextNo', r, { step: '1' })}${C.num('Default terms (days)', 'inv.termsDays', r, { step: '1' })}${C.text('Tax label', 'inv.taxLabel', r)}${C.num('Tax rate (%)', 'inv.taxRate', r, { step: '0.01' })}` +
          `${C.num('Price per fume hood inspection ($)', 'inv.fhPrice', r, { step: '0.01' })}${C.num('Hourly rate ($)', 'inv.hourly', r, { step: '0.01' })}${C.num('Mileage rate ($/km)', 'rates.km', r, { step: '0.001' })}</div>` +
          `${C.area('Default invoice notes', 'inv.notes', r, { rows: 2 })}${C.area('Payment instructions (bank / e-transfer details)', 'inv.payment', r, { rows: 4, ph: 'Printed on every invoice. Stored on the DSHC server.' })}`) +
        C.sec('fh', 'Fume hood reference range', `<div class="grid2">${C.num('Minimum average face velocity (fpm)', 'fh.minFpm', r, { step: '1' })}${C.num('Maximum (fpm)', 'fh.maxFpm', r, { step: '1' })}</div><p class="muted small">Used only to flag the average on reports. Set these to whatever your client or standard requires.</p>`) +
        `<details class="card" data-sec="data" id="data" open><summary>Data and backup</summary><div class="body">` +
        `<p class="muted small">Stored on the DSHC server and shared by everyone who signs in: ${count('fh')} inspections, ${count('jsa')} JSAs, ${count('veh')} vehicle checks, ${count('site')} site inspections, ${count('time')} time entries, ${count('exp')} expenses, ${count('inv')} invoices, ${count('cust')} customers.${r.lastBackup ? ' Last backup: ' + esc(fmtDate(r.lastBackup)) + '.' : ''}</p>` +
        `<div class="row"><button class="btn" data-act="exportAll">Back up everything (.json)</button><button class="btn" data-act="importAll">Restore backup</button></div><hr style="border:0;border-top:1px solid var(--line);margin:.9rem 0">` +
        `<p class="small"><b>Inspection history (CSV)</b> — same columns as your “Previous Inspections” spreadsheet. In Excel use File → Save As → CSV to import.</p>` +
        `<div class="row"><button class="btn" data-act="exportCsv">Export inspections (.csv)</button><button class="btn" data-act="importCsv">Import inspections (.csv)</button></div><hr style="border:0;border-top:1px solid var(--line);margin:.9rem 0">` +
        (App.legacyCount ? `<p class="small"><b>Records saved on this device</b> — ${App.legacyCount} from before the switch to the server.</p><div class="row"><button class="btn primary" data-act="uploadLocal">Upload them to the server</button></div><hr style="border:0;border-top:1px solid var(--line);margin:.9rem 0">` : '') +
        `<div class="row"><button class="btn" data-act="loadSample">Load sample data</button><button class="btn" data-act="clearSample">Remove sample data</button></div></div></details>` +
        `<details class="card" data-sec="acct" open><summary>Your login</summary><div class="body">` +
        `<p class="muted small">Signed in as ${esc(Store.user.name || Store.user.email)} (${esc(Store.user.email)}). Your name, signature and vehicle above are yours; everything else is shared.</p>` +
        `<div class="row"><button class="btn" data-act="changePw">Change password</button><button class="btn" data-act="signOut">Sign out</button></div></div></details>`;
    },
  };
  M.settings = settingsMod;
  route(/^#\/settings(?:#\w+)?$/, async () => {
    Ctx.mod = settingsMod; Ctx.rec = Settings.get(); Ctx.mode = 'form'; Ctx.dirty = false; Ctx.closed = new Set();
    setHeader({ title: 'Settings', back: '#/home' });
    App.renderForm();
    if (location.hash.endsWith('#data')) { const d = $('#data'); if (d) d.scrollIntoView(); }
  });
  act.logoClear = () => { Ctx.rec.company.logo = ''; App.changed('company.logo'); App.renderForm(); };
  document.addEventListener('change', async (e) => {
    if (e.target.id === 'logoin' && Ctx.mod === settingsMod) {
      const f = e.target.files[0]; if (!f) return;
      try { Ctx.rec.company.logo = await App.resizeImage(f, 480, 0.92, 'image/png'); App.changed('company.logo'); App.renderForm(); } catch (x) { toast('Could not read that image'); }
    }
  });

  /* ----------------------------------------------------- backup / restore */
  let pickMode = null;
  const pick = (mode, accept) => { pickMode = mode; const f = $('#filepick'); f.accept = accept; f.value = ''; f.click(); };
  act.exportAll = async () => {
    const recs = []; Store.mem.forEach((r) => recs.push(r));
    await Settings.set('lastBackup', nowIso());
    download(`dshc-field-backup-${today()}.json`, JSON.stringify({ app: 'dshc-field', version: 1, exported: nowIso(), records: Array.from(Store.mem.values()) }), 'application/json');
    toast('Backup downloaded — keep it somewhere safe');
    if (location.hash === '#/home') App.go();
  };
  act.importAll = () => pick('json', '.json,application/json');
  act.exportCsv = () => { download(`fume-hood-inspections-${today()}.csv`, App.csv.exportInspections(), 'text/csv'); toast('CSV downloaded'); };
  act.importCsv = () => pick('csv', '.csv,text/csv');
  $('#filepick').addEventListener('change', async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const text = await f.text();
    try {
      if (pickMode === 'json') {
        const data = JSON.parse(text); if (!data || !Array.isArray(data.records)) throw new Error('This is not a Field Forms backup');
        let n = 0;
        for (const r of data.records) {
          if (!r || !r.id || !r.type) continue;
          const cur = Store.get(r.id);
          if (!cur || String(r.updated || '') > String(cur.updated || '')) { const keep = r.updated; await Store.save(r); r.updated = keep; Store.mem.set(r.id, r); n++; }
        }
        toast(`Restored ${n} record${n === 1 ? '' : 's'}`);
      } else if (pickMode === 'csv') {
        const res = await App.csv.importInspections(text);
        toast(`Imported ${res.added} inspection${res.added === 1 ? '' : 's'}${res.skipped ? ` (${res.skipped} skipped)` : ''}`, 4000);
      }
      App.go();
    } catch (err) { toast('Could not import: ' + err.message, 4500); }
  });

  /* --------------------------------------------------------- sample data */
  act.loadSample = async () => {
    if (!(await confirmBox('Add a few made-up records so you can try the site? You can remove them again from here.', 'Add samples', false))) return;
    const cust = Object.assign(M.cust.blank(), { sample: true, name: 'Sample Chemicals Ltd.', contact: 'Pat Sample', phone: '555-0100', email: 'pat@example.com', address: '1 Example Road\nSampleton, AB' });
    await Store.save(cust);
    const hoods = [['SC-101', [92, 99, 94, 82, 77, 77, 78], [86, 84, 89, 81, 83, 85, 82]], ['SC-102', [60, 62, 58, 64, 61, 59, 63], [55, 57, 60, 52, 58, 56, 54]], ['SC-103', [105, 110, 108, 112, 107, 109, 111], [101, 104, 99, 103, 106, 102, 100]]];
    for (const [id, a, b] of hoods) {
      const r = M.fh.blank();
      Object.assign(r, { sample: true, status: 'final', customer: cust.name, lab: 'Main Lab', fhId: id, manufacturer: 'Labconco', width: '72', clientRef: 'PO-1001', tech: 'Sample Tech', baffle: 'Good', sash: 'Good', liner: 'Good', workSurface: 'Good', cable: 'Fair', rollers: 'Good', alarm: 'Good', alarmModel: 'Phoenix' });
      r.readings.r9 = a.map(String).concat(['']); r.readings.r0 = b.map(String).concat(['']);
      if (id === 'SC-102') r.deficiencies = 'Alarm not calibrated\nLight does not work';
      await Store.save(r);
    }
    await Store.save(Object.assign(M.time.blank(), { sample: true, customer: cust.name, task: 'Fume hood inspection', location: 'Main Lab', hours: '2.5', jobNo: 'J-100' }));
    await Store.save(Object.assign(M.exp.blank(), { sample: true, customer: cust.name, category: 'Mileage', km: '84', amount: String(round2(84 * Settings.get().rates.km)), desc: 'Mileage 84 km' }));
    toast('Sample data added'); App.go();
  };
  act.clearSample = async () => {
    const del = []; Store.mem.forEach((r) => { if (r.sample) del.push(r.id); });
    for (const id of del) await Store.del(id);
    toast(del.length ? `Removed ${del.length} sample records` : 'No sample data found'); App.go();
  };
  /* -------------------------------------------- login + old device data */
  act.signOut = async () => {
    if (!(await confirmBox('Sign out on this device?', 'Sign out', false))) return;
    await App.flush(); Store.setToken(''); location.hash = '#/home'; location.reload();
  };
  act.changePw = () => {
    const s = modal(`<h3>Change password</h3><form id="pwf">` +
      `<label class="fld"><span>Current password</span><input type="password" name="old" autocomplete="current-password" required></label>` +
      `<label class="fld"><span>New password (8+ characters)</span><input type="password" name="new" autocomplete="new-password" minlength="8" required></label>` +
      `<div class="row end"><button type="button" class="btn" data-x="1">Cancel</button><button class="btn primary">Change</button></div></form>`);
    s.querySelector('[data-x]').onclick = closeModal;
    s.querySelector('#pwf').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target;
      try { const { data } = await Store.api('POST', 'password', { old: f.old.value, new: f.new.value }); Store.setToken(data.token); closeModal(); toast('Password changed — other devices will need to sign in again', 4000); }
      catch (err) { toast(err.message, 4000); }
    };
  };
  // One-time move of records the old device-only version kept in this browser.
  // Newer copies already on the server win; the local copy is left in place.
  act.uploadLocal = async () => {
    const recs = await Store.legacy();
    if (!(await confirmBox(`Upload ${recs.length} record${recs.length === 1 ? '' : 's'} saved on this device to the server, where everyone who signs in can see them?`, 'Upload', false))) return;
    let n = 0, failed = 0;
    for (const r of recs) {
      if (!r || !r.id || !r.type) continue;
      const cur = r.id === 'settings' ? Store.get('settings-u' + Store.user.id) || Store.get('settings') : Store.get(r.id);
      if (cur && String(cur.updated || '') >= String(r.updated || '')) continue;
      const ok = await Store.save(r);
      if (ok === true) n++; else failed++;
    }
    if (failed) { toast(`Uploaded ${n}; ${failed} could not be saved — try again`, 5000); }
    else { try { localStorage.setItem('fh-legacy-done', '1'); } catch (e) { /* ignore */ } App.legacyCount = 0; toast(`Uploaded ${n} record${n === 1 ? '' : 's'} to the server`, 4000); }
    App.go();
  };

  /* ------------------------------------------------------------ navigation */
  function buildNav() {
    $('#tabs').innerHTML =
      `<a href="#/home" data-nav="home">${icon('home')}<span>Home</span></a>` +
      `<a href="#/time" data-nav="time">${icon('time')}<span>Time</span></a>` +
      `<a href="#" class="plus" data-act="newSheet" aria-label="New">${icon('plus')}<span>New</span></a>` +
      `<a href="#/list/inv" data-nav="inv">${icon('inv')}<span>Invoices</span></a>` +
      `<a href="#/settings" data-nav="settings">${icon('gear')}<span>Settings</span></a>`;
  }
  act.newSheet = () => menuSheet('Create new', [
    ['visit', 'Site visit (all forms + PDFs)'], ['fh', 'Fume hood inspection'], ['jsa', 'Job safety analysis'], ['veh', 'Vehicle inspection'], ['site', 'Site inspection'], ['time', 'Time entry'], ['exp', 'Expense'], ['inv', 'Invoice'], ['cust', 'Customer'],
  ].map(([k, label]) => ({ label, icon: k, href: '#/new/' + k })));
  App.onRoute = (h) => {
    const on = /^#\/(home)?$/.test(h) ? 'home' : /^#\/(time|report|new\/(time|exp)|edit\/(time|exp))/.test(h) ? 'time' : /^#\/(list\/inv|new\/inv|edit\/inv|view\/inv)/.test(h) ? 'inv' : /^#\/settings/.test(h) ? 'settings' : '';
    $$('#tabs a[data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === on));
  };

  /* ------------------------------------------------------------------ boot */
  (async function boot() {
    await Store.init();
    buildNav();
    let done = false; try { done = localStorage.getItem('fh-legacy-done') === '1'; } catch (e) { /* ignore */ }
    App.legacyCount = done ? 0 : (await Store.legacy()).filter((r) => r && r.id && r.type).length;
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
    await App.go();
  })();
})();
