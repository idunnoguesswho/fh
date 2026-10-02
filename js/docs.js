/* ==========================================================================
   docs.js — printable documents (preview + Save as PDF) and CSV import/export.
   Each module gets a doc(rec) function that returns the HTML of one "paper".
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { esc, nl2br, num, money, fmtDate, norm, round2, Settings, Store, uid, nowIso, today, pad, MON } = App;
  const M = App.modules;

  /* ---------------------------------------------------------- shared pieces */
  function head(title, subHtml) {
    const c = Settings.get().company;
    return `<div class="dh"><div>${c.logo ? `<img class="dlogo" src="${c.logo}" alt="">` : ''}<b>${esc(c.name)}</b>` +
      `${c.address ? '<br>' + nl2br(c.address) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}${c.email ? (c.phone ? ' · ' : '<br>') + esc(c.email) : ''}${c.web ? '<br>' + esc(c.web) : ''}</div>` +
      `<div class="dtitle"><h1>${esc(title)}</h1>${subHtml || ''}</div></div>`;
  }
  const foot = () => `<div class="foot">Printed ${esc(new Date().toLocaleString('en-CA'))} · ${esc(Settings.get().company.name)}</div>`;
  // rows of "label | value | label | value"
  function pairs(list) {
    let out = '<table class="kv">';
    for (let i = 0; i < list.length; i += 2) {
      const a = list[i], b = list[i + 1];
      out += `<tr><th>${esc(a[0])}</th><td>${esc(a[1])}</td>${b ? `<th>${esc(b[0])}</th><td>${esc(b[1])}</td>` : '<td colspan="2"></td>'}</tr>`;
    }
    return out + '</table>';
  }
  const para = (title, text) => (text ? `<h3>${esc(title)}</h3><div>${nl2br(text)}</div>` : '');
  const sigBlock = (items) => `<table class="nobreak"><tr>${items.map(([label, img, name]) =>
    `<td style="width:${100 / items.length}%"><div class="sigline">${img ? `<img class="sigimg" src="${img}" alt="">` : ''}</div><small>${esc(label)}${name ? ': ' + esc(name) : ''}</small></td>`).join('')}</tr></table>`;
  const photosDoc = (list, title) => ((list || []).length ? `<h3>${esc(title)}</h3><div class="photos-doc">${list.map((s) => `<img src="${s}" alt="">`).join('')}</div>` : '');
  const addr = (a) => nl2br(a || '');

  /* ---------------------------------------------------- fume hood inspection */
  M.fh.doc = (r) => {
    const st = App.fhStats(r), v = App.fhVerdict(st), f = Settings.get().fh;
    const used = App.ROWS.filter(([k]) => ((r.readings && r.readings[k]) || []).some((x) => String(x).trim() !== ''));
    let maxI = 0; used.forEach(([k]) => r.readings[k].forEach((x, i) => { if (String(x).trim() !== '') maxI = Math.max(maxI, i); }));
    const cols = Array.from({ length: maxI + 1 }, (_, i) => i);
    const grid = used.length
      ? `<table class="grid-r"><tr><th>Height</th>${cols.map((i) => `<th>${i + 1}</th>`).join('')}</tr>${used.map(([k, lab]) => `<tr><th>${lab}</th>${cols.map((i) => `<td>${esc(r.readings[k][i] || '')}</td>`).join('')}</tr>`).join('')}</table>`
      : '<p>No readings recorded.</p>';
    return head('Fume Hood Inspection', `<small>${esc(r.customer)}</small><small>Fume hood ${esc(r.fhId)}</small>`) +
      pairs([['Customer', r.customer], ['Lab / room', r.lab], ['Fume hood', r.fhId], ['Manufacturer', r.manufacturer], ['Serial number', r.serial], ['Width (in)', r.width],
        ['Client reference', r.clientRef], ['Work order', r.wo], ['Technician', r.tech], ['Issued', fmtDate(r.issued)], ['Completed', fmtDate(r.completed)]]) +
      '<h3>Condition</h3>' +
      pairs([['Baffle', r.baffle], ['Sash', r.sash], ['Liner', r.liner], ['Work surface', r.workSurface], ['Cable', r.cable], ['Rollers', r.rollers], ['Alarm', r.alarm], ['Alarm model', r.alarmModel], ['Magnehelic gauge', r.magnehelic]]) +
      '<h3>Face velocity (fpm)</h3>' + grid +
      `<table class="kv"><tr><th>Number of readings</th><td>${st.n}</td><th>Total</th><td>${Math.round(st.total).toLocaleString('en-CA')}</td><th>Average flow</th><td><b>${st.n ? Math.round(st.avg) : '–'}</b> fpm</td></tr></table>` +
      (v ? `<p class="${v.cls}">${esc(v.text)} (reference range is set in Settings).</p>` : '') +
      para('Comments', r.comments) + para('Deficiencies', r.deficiencies) + photosDoc(r.photos, 'Photos') +
      '<br>' + sigBlock([['Technician', r.sigTech, r.tech], ['Client representative', r.sigClient, r.clientName]]) + foot();
  };

  /* ----------------------------------------------------------------------- JSA */
  M.jsa.doc = (r) => {
    const ppe = App.PPE.filter(([k]) => r.ppe && r.ppe[k]).map(([, l]) => l); if (r.ppeOther) ppe.push(r.ppeOther);
    const rows = (r.steps || []).map((s, i) => `<tr><td>${i + 1}</td><td>${nl2br(s.step)}</td><td>${nl2br(s.hazard)}</td><td>${nl2br(s.control)}</td><td>${esc(s.risk)}</td></tr>`).join('');
    return head('Job Safety Analysis', `<small>${esc(r.jsaNo)}</small>`) +
      pairs([['Date', fmtDate(r.date)], ['Time', r.time], ['Client', r.client], ['Site / location', r.site], ['Supervisor / site contact', r.supervisor], ['Permit / WO', r.permit]]) +
      para('Work being done', r.workDesc) +
      `<h3>PPE required</h3><div>${ppe.length ? esc(ppe.join(' · ')) : '—'}</div>` +
      `<h3>Task steps, hazards and controls</h3><table><tr><th>#</th><th>Task step</th><th>Hazards</th><th>Controls</th><th>Residual risk</th></tr>${rows}</table>` +
      '<h3>Emergency information</h3>' + pairs([['Emergency contact', r.emergency.contact], ['Phone', r.emergency.phone], ['Muster point', r.emergency.muster], ['First aid / eyewash', r.emergency.firstAid]]) +
      `<h3>Confirmations</h3><div>${r.reviewed ? '☑' : '☐'} Hazards and controls reviewed with the crew &nbsp; ${r.fit ? '☑' : '☐'} Everyone fit for work &nbsp; ${r.stopWork ? '☑' : '☐'} Crew knows they can stop work</div>` +
      para('Notes', r.notes) +
      `<h3>Crew sign-on</h3><table><tr><th style="width:40%">Name</th><th>Signature</th></tr>${(r.crew || []).map((c) => `<tr><td>${esc(c.name)}</td><td style="height:44px">${c.sig ? `<img class="sigimg" src="${c.sig}" alt="">` : ''}</td></tr>`).join('')}</table>` + foot();
  };

  /* ------------------------------------------------------------------- vehicle */
  M.veh.doc = (r) => {
    const groups = App.VEH_GROUPS.map(([k, title, list]) =>
      `<h3>${esc(title)}</h3><table>${list.map((label, i) => { const v = (r.items && r.items[k] && r.items[k][i]) || ''; return `<tr><td>${esc(label)}</td><td style="width:70px" class="${v === 'defect' ? 'bad' : v === 'ok' ? 'ok' : ''}">${v === 'ok' ? 'OK' : v === 'defect' ? 'DEFECT' : v === 'na' ? 'N/A' : '—'}</td></tr>`; }).join('')}</table>`).join('');
    const d = App.vehDefects(r);
    return head('Vehicle Inspection', `<small>${esc(r.kind)}</small>`) +
      pairs([['Date', fmtDate(r.date)], ['Time', r.time], ['Driver', r.driver], ['Vehicle', r.vehicle], ['Licence plate', r.plate], ['Odometer (km)', r.odometer], ['Location', r.location], ['Defects marked', String(d)]]) +
      groups + para('Defects found', r.defects) + para('Action taken / reported to', r.action) +
      `<h3>Result</h3><div>Vehicle safe to operate: <b class="${r.safe === 'No' ? 'bad' : 'ok'}">${esc(r.safe || '—')}</b></div><br>` +
      sigBlock([['Driver', r.sigDriver, r.driver]]) + foot();
  };

  /* ---------------------------------------------------------------------- site */
  M.site.doc = (r) => {
    const rows = App.SITE_CHECKS.map(([k, label]) => { const v = (r.checks && r.checks[k]) || ''; return `<tr><td>${esc(label)}</td><td style="width:60px" class="${v === 'No' ? 'bad' : v === 'Yes' ? 'ok' : ''}">${esc(v || '—')}</td></tr>`; }).join('');
    return head('Site Inspection', `<small>${esc(r.siteName || r.customer)}</small>`) +
      pairs([['Date', fmtDate(r.date)], ['Time', r.time], ['Inspector', r.inspector], ['Customer', r.customer], ['Site / building', r.siteName], ['Job / PO', r.jobPO]]) +
      `<h3>Site address</h3><div>${esc([r.street, r.city, r.prov, r.postal].filter(Boolean).join(', '))}</div>` +
      '<h3>Site access and contacts</h3>' + pairs([['Site contact', r.contact], ['Contact phone', r.contactPhone], ['Site emergency number', r.emergencyPhone], ['Escort', r.escort], ['Alternate contact', r.altContact], ['Alternate phone', r.altPhone]]) +
      para('Documents required at the gate', r.gateDocs) +
      `<h3>Site conditions</h3><table>${rows}</table>` + para('Hazards / issues noted', r.hazards) + para('Actions required before work starts', r.actions) + photosDoc(r.photos, 'Photos') +
      '<br>' + sigBlock([['Inspector', r.sigInspector, r.inspector], ['Site representative', r.sigRep, r.siteRep]]) + foot();
  };

  /* ------------------------------------------------------------------- invoice */
  M.inv.doc = (r) => {
    const s = Settings.get(), c = s.company, t = App.invTotals(r);
    const items = (r.items || []).filter((i) => i.desc || num(i.price)).map((i) =>
      `<tr><td>${esc(i.desc)}${i.sub ? `<br><small>${esc(i.sub)}</small>` : ''}</td><td class="num">${esc(i.qty)}</td><td class="num">${money(num(i.price))}</td><td class="num">${money(num(i.qty) * num(i.price))}</td></tr>`).join('');
    const ship = r.shipTo && (r.shipTo.name || r.shipTo.address);
    return `<div class="dh"><div>${c.logo ? `<img class="dlogo" src="${c.logo}" alt="">` : ''}<b style="font-size:16px">${esc(c.name)}</b>${c.address ? '<br>' + nl2br(c.address) : ''}${c.phone ? '<br>' + esc(c.phone) : ''}${c.email ? '<br>' + esc(c.email) : ''}${c.web ? '<br>' + esc(c.web) : ''}</div>` +
      `<div class="dtitle"><h1>INVOICE</h1>${c.tagline ? `<small><i>${esc(c.tagline)}</i></small>` : ''}</div></div>` +
      `<table class="nobreak"><tr><td style="width:50%"><b>BILL TO</b><br>${esc(r.billTo.name)}${r.billTo.contact ? '<br>' + esc(r.billTo.contact) : ''}${r.billTo.address ? '<br>' + addr(r.billTo.address) : ''}${r.billTo.phone ? '<br>' + esc(r.billTo.phone) : ''}${r.billTo.email ? '<br>' + esc(r.billTo.email) : ''}</td>` +
      `<td><b>${ship ? 'SHIP TO' : 'INVOICE'}</b>${ship ? `<br>${esc(r.shipTo.name)}${r.shipTo.address ? '<br>' + addr(r.shipTo.address) : ''}${r.shipTo.phone ? '<br>' + esc(r.shipTo.phone) : ''}<br><br>` : '<br>'}` +
      `Invoice number: <b>${esc(r.number)}</b><br>Invoice date: ${esc(fmtDate(r.date))}<br>Payment due: ${esc(fmtDate(r.due))}${r.poNumber ? `<br>PO / reference: ${esc(r.poNumber)}` : ''}<br><span class="big">Amount due (CAD): ${money(t.total)}</span></td></tr></table>` +
      `<table><tr><th>Items</th><th class="num" style="width:60px">Quantity</th><th class="num" style="width:90px">Price</th><th class="num" style="width:100px">Amount</th></tr>${items}</table>` +
      `<table class="tot nobreak"><tr><th>Subtotal</th><td class="num">${money(t.sub)}</td></tr><tr><th>${esc(r.taxLabel)} ${esc(r.taxRate)}%${c.taxNo ? ` (${esc(c.taxNo)})` : ''}</th><td class="num">${money(t.tax)}</td></tr><tr><th>Total</th><td class="num"><b>${money(t.total)}</b></td></tr><tr><th>Amount due (CAD)</th><td class="num big">${money(t.total)}</td></tr></table>` +
      ((s.inv.payment || r.notes) ? `<h3>Notes / terms</h3>${s.inv.payment ? `<div>${nl2br(s.inv.payment)}</div><br>` : ''}<div>${nl2br(r.notes)}</div>` : '') +
      (r.status === 'paid' ? `<p class="ok">PAID${r.paidDate ? ' ' + esc(fmtDate(r.paidDate)) : ''}</p>` : '') + foot();
  };

  /* ---------------------------------- time / expense entries (single record) */
  M.time.doc = (r) => head('Time Entry') + pairs([['Date', fmtDate(r.date)], ['Customer', r.customer], ['Task', r.task], ['Location', r.location], ['Hours', r.hours], ['Approved by', r.approvedBy], ['Job number', r.jobNo], ['Quote number', r.quoteNo]]) + para('Notes', r.notes) + foot();
  M.exp.doc = (r) => head('Expense') + pairs([['Date', fmtDate(r.date)], ['Category', r.category], ['Customer', r.customer], ['Job / PO', r.jobNo], ['Amount', money(num(r.amount))], ['Description', r.desc]]) + photosDoc(r.receipt, 'Receipt') + foot();
  M.cust.doc = (r) => head('Customer') + pairs([['Name', r.name], ['Contact', r.contact], ['Phone', r.phone], ['Email', r.email]]) + para('Billing address', r.address) + foot();

  /* ------------------------------------------------ reports (not single records) */
  const inRange = (d, from, to) => (!from || d >= from) && (!to || d <= to);
  const cmatch = (x, cust) => !cust || norm(x.customer).includes(norm(cust));

  // Daily Work Log — mirrors your "Subcontractor Daily Work Log" template, filled from Time entries
  App.docs.log = (p) => {
    const rows = Store.all('time').filter((x) => x.date === p.date && cmatch(x, p.cust) && (!p.job || norm(x.jobNo) === norm(p.job)))
      .sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')));
    const first = rows[0] || {};
    const total = rows.reduce((a, x) => a + num(x.hours), 0);
    const body = rows.map((x) => `<tr><td>${esc(x.task)}</td><td>${esc(x.location)}</td><td>${esc(x.approvedBy)}</td><td class="num">${esc(x.hours)}</td><td>${x.completed ? 'Yes' : ''}</td></tr>`).join('') +
      Array.from({ length: Math.max(0, 10 - rows.length) }, () => '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>').join('');
    const notes = rows.map((x) => x.notes).filter(Boolean).join('\n');
    return head('Daily Work Log') +
      pairs([['To', p.cust || first.customer || ''], ['Job number', p.job || first.jobNo || ''], ['Quote number', first.quoteNo || ''], ['Client reference', first.clientRef || ''], ['Date worked', fmtDate(p.date)], ['Total hours', String(round2(total))]]) +
      `<h3>Work performed</h3><table><tr><th>Task</th><th>Work space / room / elevation</th><th>Approved by</th><th class="num" style="width:60px">Hours</th><th style="width:80px">Completed</th></tr>${body}</table>` +
      `<p>FLHAs &amp; EWOs submitted end of day: ☐</p>` +
      `<h3>Notes / deficiencies</h3><div style="min-height:50px">${nl2br(notes)}</div><br>` +
      `<table class="nobreak"><tr><th></th><th>Team lead – start of shift</th><th>Client / GC – start of shift</th><th>Team lead – end of shift</th><th>Client / GC – end of shift</th></tr>` +
      ['Signature', 'Name', 'Position / title'].map((l) => `<tr><th>${l}</th><td style="height:40px"></td><td></td><td></td><td></td></tr>`).join('') + '</table>' + foot();
  };

  // Time & Expense report for a date range (and optional customer)
  App.docs.te = (p) => {
    const times = Store.all('time').filter((x) => inRange(x.date, p.from, p.to) && cmatch(x, p.cust)).sort((a, b) => a.date.localeCompare(b.date));
    const exps = Store.all('exp').filter((x) => inRange(x.date, p.from, p.to) && cmatch(x, p.cust)).sort((a, b) => a.date.localeCompare(b.date));
    const hrs = times.reduce((a, x) => a + num(x.hours), 0), spend = exps.reduce((a, x) => a + num(x.amount), 0);
    const byCust = {}; times.forEach((x) => { const k = x.customer || '(none)'; byCust[k] = (byCust[k] || 0) + num(x.hours); });
    const byCat = {}; exps.forEach((x) => { const k = x.category || 'Other'; byCat[k] = (byCat[k] || 0) + num(x.amount); });
    return head('Time & Expense Report', `<small>${esc(fmtDate(p.from))} to ${esc(fmtDate(p.to))}</small>${p.cust ? `<small>${esc(p.cust)}</small>` : ''}`) +
      `<h3>Time</h3><table><tr><th>Date</th><th>Customer</th><th>Job</th><th>Task</th><th>Location</th><th class="num">Hours</th></tr>${times.map((x) => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.customer)}</td><td>${esc(x.jobNo)}</td><td>${esc(x.task)}</td><td>${esc(x.location)}</td><td class="num">${esc(x.hours)}</td></tr>`).join('') || '<tr><td colspan="6">No time entries.</td></tr>'}` +
      `<tr><th colspan="5" class="num">Total hours</th><th class="num">${round2(hrs)}</th></tr></table>` +
      `<table class="tot">${Object.keys(byCust).map((k) => `<tr><th>${esc(k)}</th><td class="num">${round2(byCust[k])} h</td></tr>`).join('')}</table>` +
      `<h3>Expenses</h3><table><tr><th>Date</th><th>Category</th><th>Description</th><th>Customer</th><th class="num">Amount</th></tr>${exps.map((x) => `<tr><td>${esc(fmtDate(x.date))}</td><td>${esc(x.category)}</td><td>${esc(x.desc)}</td><td>${esc(x.customer)}</td><td class="num">${money(num(x.amount))}</td></tr>`).join('') || '<tr><td colspan="5">No expenses.</td></tr>'}` +
      `<tr><th colspan="4" class="num">Total expenses</th><th class="num">${money(spend)}</th></tr></table>` +
      `<table class="tot">${Object.keys(byCat).map((k) => `<tr><th>${esc(k)}</th><td class="num">${money(byCat[k])}</td></tr>`).join('')}</table>` + foot();
  };

  /* ================================================================== CSV */
  // Same columns as your "Previous Inspections.xlsx" so history can move both ways.
  const GRID = []; [['18'], ['9'], ['0']].forEach(([h]) => { for (let i = 1; i <= 8; i++) GRID.push(`${i}-${h}`); });
  const CSV_COLS = ['Inspection ID', 'Customer', 'Lab', 'FH', 'Manufacturer', 'SN', 'Width', 'Height', 'Magenhelic', 'Alarm', 'AlarmModel', 'Baffle', 'Sash', 'Liner', 'WorkSurface', 'Cable', 'Rollers', 'ClientRef', 'Comments', 'Date', 'Deficiencies']
    .concat(GRID, ['Technician', 'Email', 'NorlabWO', 'Readings', 'Average', 'TotalReadings']);

  function csvParse(text) {
    text = String(text).replace(/^﻿/, '');
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === ',') { row.push(f); f = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; rows.push(row); row = []; }
      else f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter((r) => r.some((x) => x !== ''));
  }
  const csvCell = (v) => { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const slashDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? `${m[3]}/${MON[+m[2] - 1]}/${m[1]}` : ''; };
  function parseDate(s) {
    s = String(s || '').trim(); if (!s) return '';
    let m = /^(\d{1,2})[\/-]([A-Za-z]{3})[a-z]*[\/-](\d{4})$/.exec(s);
    if (m) { const i = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()); if (i >= 0) return `${m[3]}-${pad(i + 1)}-${pad(+m[1])}`; }
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return m[0];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s); if (m) return `${m[3]}-${pad(+m[1])}-${pad(+m[2])}`;
    const d = new Date(s); return isNaN(d) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const condOut = (v) => (v === 'N/A' ? 'NA' : v || '');
  const condIn = (v) => { v = String(v || '').trim(); return /^n\/?a$/i.test(v) ? 'N/A' : v; };

  App.csv = {
    exportInspections() {
      const rows = Store.all('fh').sort((a, b) => String(a.completed).localeCompare(String(b.completed))).map((r) => {
        const st = App.fhStats(r), g = {};
        App.ROWS.forEach(([k, lab]) => { for (let i = 0; i < 8; i++) g[`${i + 1}-${lab.split(' ')[0]}`] = (r.readings && r.readings[k] && r.readings[k][i]) || ''; });
        const v = { 'Inspection ID': r.id, Customer: r.customer, Lab: r.lab, FH: r.fhId, Manufacturer: r.manufacturer, SN: r.serial, Width: r.width, Height: r.height, Magenhelic: r.magnehelic, Alarm: r.alarm, AlarmModel: r.alarmModel,
          Baffle: condOut(r.baffle), Sash: condOut(r.sash), Liner: condOut(r.liner), WorkSurface: condOut(r.workSurface), Cable: condOut(r.cable), Rollers: condOut(r.rollers), ClientRef: r.clientRef, Comments: r.comments,
          Date: slashDate(r.completed || r.issued), Deficiencies: r.deficiencies, Technician: r.tech, Email: '', NorlabWO: r.wo, Readings: st.n, Average: st.n ? st.avg.toFixed(2) : '', TotalReadings: st.total };
        Object.assign(v, g);
        return CSV_COLS.map((c) => csvCell(v[c])).join(',');
      });
      return [CSV_COLS.join(',')].concat(rows).join('\r\n');
    },
    // Import rows from a CSV saved out of Excel. Skips any inspection already in the app.
    async importInspections(text) {
      const rows = csvParse(text); if (rows.length < 2) return { added: 0, skipped: 0 };
      const hdr = rows[0].map((h) => h.trim()), ix = (name) => hdr.indexOf(name);
      const key = (r) => [norm(r.customer), norm(r.fhId), r.completed, norm(r.serial)].join('|');
      const have = new Set(Store.all('fh').map(key)); let added = 0, skipped = 0;
      for (const row of rows.slice(1)) {
        const get = (n) => { const i = ix(n); return i >= 0 ? (row[i] || '').trim() : ''; };
        const date = parseDate(get('Date'));
        const r = M.fh.blank();
        Object.assign(r, { status: 'final', legacyId: get('Inspection ID'), customer: get('Customer'), lab: get('Lab'), fhId: get('FH'), manufacturer: get('Manufacturer'), serial: get('SN'), width: get('Width'), height: get('Height'),
          magnehelic: get('Magenhelic'), alarm: get('Alarm'), alarmModel: get('AlarmModel'), baffle: condIn(get('Baffle')), sash: condIn(get('Sash')), liner: condIn(get('Liner')), workSurface: condIn(get('WorkSurface')),
          cable: condIn(get('Cable')), rollers: condIn(get('Rollers')), clientRef: get('ClientRef'), wo: get('NorlabWO'), comments: get('Comments'), deficiencies: get('Deficiencies'), tech: get('Technician'), issued: date, completed: date });
        App.ROWS.forEach(([k, lab]) => { for (let i = 1; i <= 8; i++) r.readings[k][i - 1] = get(`${i}-${lab.split(' ')[0]}`); });
        if (!r.customer && !r.fhId) { skipped++; continue; }
        if (have.has(key(r))) { skipped++; continue; }
        have.add(key(r)); await Store.save(r); added++;
      }
      return { added, skipped };
    },
  };
})();
