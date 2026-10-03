/* ==========================================================================
   pack.js — the PDF package for one site visit.
   Builds the 7 controlled forms (C.001, C.002, C.004, C.008, C.024, C.051,
   C.052) plus one fume hood inspection report per hood, renders each to a
   real PDF on the device, and bundles them into a ZIP with consistent names.
   Works offline: the PDF libraries ship in js/vendor/ and load on demand.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { $, esc, nl2br, num, round2, money, fmtDate, norm, safeName, nowIso, toast, icon, Store, Settings, Ctx, act, route, setHeader } = App;
  const M = App.modules;

  /* --------------------------------------------------- document control data */
  // Header block shown on each controlled form (taken from your Drive templates)
  const CTL = {
    'C.001': { title: 'Field Level Hazard Assessment, Tool Box Talk, Daily Report', eff: '15-MAY-2025', by: 'Snow', rev: 'Snow', short: 'FLHA' },
    'C.002': { title: 'Vehicle Inspection', eff: '15-MAY-2025', by: 'Snow', rev: 'Snow', short: 'Vehicle_Inspection' },
    'C.004': { title: 'Daily Report', eff: '15-MAY-2025', by: 'Snow', rev: 'Snow', short: 'Daily_Report' },
    'C.008': { title: 'Mileage Cover Sheet', eff: '', by: '', rev: '', short: 'Mileage_Cover_Sheet' },
    'C.024': { title: 'Worksite Inspection', eff: '15-MAY-2025', by: 'Snow', rev: 'Snow', short: 'Worksite_Inspection' },
    'C.051': { title: 'Journey Management Form', eff: '26-MAY-2026', by: 'HR Manager', rev: 'Snow', short: 'Journey_Management' },
    'C.052': { title: '360 Before Driving Checklist', eff: '26-MAY-2026', by: 'HR Manager', rev: 'Snow', short: '360_Before_Driving' },
  };
  const RECORDS = 'Maintain this form according to company records, payroll, safety, HR, privacy, or client requirements.';

  /* ----------------------------------------------------------- html helpers */
  const bx = (on) => `<span class="bx${on ? ' on' : ''}">${on ? 'X' : ''}</span>`;
  const mySig = (v) => v.sigTech || (v.useSaved !== false ? (Settings.get().tech.sig || '') : '');
  const sigImg = (src) => (src ? `<img class="sigimg" src="${src}" alt="">` : '');
  const addr1 = (v) => String(v.address || '').split('\n')[0];
  const kv = (list) => { // label/value pairs, two per row
    let o = '<table class="kv">';
    for (let i = 0; i < list.length; i += 2) { const a = list[i], b = list[i + 1]; o += `<tr><th>${esc(a[0])}</th><td>${nl2br(a[1] || '')}</td>${b ? `<th>${esc(b[0])}</th><td>${nl2br(b[1] || '')}</td>` : '<td colspan="2"></td>'}</tr>`; }
    return o + '</table>';
  };
  // company banner + document-control table
  function hdr(code, extra) {
    const c = Settings.get().company, d = CTL[code];
    return `<div class="dh"><div>${c.logo ? `<img class="dlogo" src="${c.logo}" alt="">` : ''}<b>${esc(c.name)}</b>${c.phone ? '<br>' + esc(c.phone) : ''}${c.email ? (c.phone ? ' · ' : '<br>') + esc(c.email) : ''}</div>` +
      `<div class="dtitle"><h1>${esc(d.title)}</h1><small>${esc(code)}${extra ? ' · ' + esc(extra) : ''}</small></div></div>` +
      `<table class="ctl"><tr><th>Document</th><th>Title</th><th>Effective date</th><th>Prepared by</th><th>Reviewer</th></tr><tr><td>${esc(code)}</td><td>${esc(d.title)}</td><td>${esc(d.eff || '—')}</td><td>${esc(d.by || '—')}</td><td>${esc(d.rev || '—')}</td></tr></table>`;
  }
  // rows of "label | ☐ ☐ ☐" for OK/Issue/N-A style lists
  function checkTable(head, rows, opts, labels) {
    return `<table class="ck"><tr><th>${esc(head)}</th>${(labels || opts).map((o) => `<th class="c">${esc(o)}</th>`).join('')}</tr>` +
      rows.map(([label, cur], i) => `<tr><td>${esc(label)}</td>${opts.map((o) => `<td class="c">${bx(cur === o)}</td>`).join('')}</tr>`).join('') + '</table>';
  }
  const sigTable = (cells) => `<table class="nobreak"><tr>${cells.map(([l, img, txt]) => `<td style="width:${100 / cells.length}%"><div class="sigline">${sigImg(img)}${txt ? `<div>${esc(txt)}</div>` : ''}</div><small>${esc(l)}</small></td>`).join('')}</tr></table>`;
  const D = (v) => fmtDate(v.date);

  /* ================================================================ the forms */
  const FORMS = {};

  // ---- C.052 360 Before Driving Checklist
  FORMS['C.052'] = (v) => {
    const k = v.d360, lg = v.legs[0] || {};
    return hdr('C.052') + `<p>Use this checklist for training, observations, high-risk driving tasks, project requirements, or as directed by a supervisor. The driver must complete the walk-around before moving the vehicle.</p>` +
      kv([['Driver', v.tech], ['Date / time', D(v) + (k.time ? ' ' + k.time : '')], ['Vehicle / plate', [v.vehicle.desc, v.vehicle.plate].filter(Boolean).join(' / ')], ['Location', lg.from || addr1(v)], ['Supervisor / observer', k.observer]]) +
      checkTable('360 check item', App.D360.map((l, i) => [l, k.items[i]]), ['OK', 'Issue', 'N/A'], ['OK', 'Issue', 'N/A']) +
      `<h3>Issue found / corrective action taken</h3><div class="box">${nl2br(k.issue) || '&nbsp;'}</div>` +
      `<h3>Sign-off</h3>` + sigTable([['Driver signature', mySig(v), v.tech], ['Date', '', D(v)], ['Observer / supervisor', '', k.observer], ['Date', '', k.observer ? D(v) : '']]) +
      `<h3>Records</h3><p>${RECORDS}</p>`;
  };

  // ---- C.051 Journey Management Form
  FORMS['C.051'] = (v) => {
    const j = v.jm, f = j.fields || {}, lg = v.legs[0] || {}, last = v.legs[v.legs.length - 1] || {};
    const rows = (list) => `<table class="kv2">${list.map(([a, b]) => `<tr><th>${esc(a)}</th><td>${nl2br(b || '')}</td></tr>`).join('')}</table>`;
    return hdr('C.051') + `<p>Complete for trips requiring journey management. Update if route, timing, hazards, passengers, or controls change. Close the journey when safe arrival is confirmed.</p>` +
      rows([['Driver', v.tech], ['Passengers', j.passengers || 'None'], ['Date', D(v)], ['Vehicle / plate', [v.vehicle.desc, v.vehicle.plate].filter(Boolean).join(' / ')], ['Destination / worksite', [v.projectName, addr1(v)].filter(Boolean).join(' – ') || last.to], ['Purpose of trip', v.purpose || v.task]]) +
      `<h3>Route and timing</h3>` + rows([['Planned route', j.route || [lg.from, last.to].filter(Boolean).join(' → ')], ['Departure time', j.depart || lg.time], ['Estimated arrival time', j.eta], ['Fuel/charging/rest stops', j.stops], ['Alternate route or stop plan', j.alt]]) +
      `<h3>Hazard / control</h3>` + rows(App.JM.map(([key, label]) => [label, f[key]])) +
      `<h3>Approval / close out</h3>` + rows([['Supervisor approval before departure', j.approval], ['Departed – time', j.departed], ['Check-in 1', j.ci1], ['Check-in 2', j.ci2], ['Safe arrival / journey closed', j.arrived]]) +
      `<h3>Sign-off</h3>` + sigTable([['Driver signature', mySig(v), v.tech], ['Date', '', D(v)], ['Supervisor / check-in person', '', v.supervisor], ['Date', '', v.supervisor ? D(v) : '']]) +
      `<h3>Records</h3><p>${RECORDS}</p>`;
  };

  // ---- C.002 Vehicle Inspection
  FORMS['C.002'] = (v) => {
    const veh = v.vehicle;
    const groups = App.VINSP.map(([k, title, list]) => checkTable(title, list.map((l, i) => [l, v.vinsp[k][i]]), ['Good', 'Needs Repair', 'N/A'], ['Good', 'Needs repair', 'N/A'])).join('');
    return hdr('C.002') + kv([['Project name', v.projectName], ['Work area', v.workArea], ['Project address', v.address], ['Task name', v.task]]) +
      `<table class="kv2"><tr><th>Vehicle make / model / year</th><td>${esc(veh.desc)}</td><th>License plate</th><td>${esc(veh.plate)}</td><th>Ownership</th><td>${bx(veh.ownership === 'Owned')} Owned &nbsp; ${bx(veh.ownership === 'Rented')} Rented</td></tr></table>` +
      groups + `<h3>Notes / deficiencies</h3><div class="box">${nl2br(v.vnotes) || '&nbsp;'}</div>` +
      `<h3>Sign in / sign out</h3><table><tr><th></th><th>Sign in</th><th>Sign out</th></tr><tr><th>Signature</th><td><div class="sigline">${sigImg(mySig(v))}</div></td><td><div class="sigline">${sigImg(mySig(v))}</div></td></tr>` +
      `<tr><th>Name</th><td>${esc(v.tech)}</td><td>${esc(v.tech)}</td></tr><tr><th>Date</th><td>${D(v)}</td><td>${D(v)}</td></tr></table>`;
  };

  // ---- C.001 Field Level Hazard Assessment
  FORMS['C.001'] = (v) => {
    const f = v.flha, p = f.ppe, s = Settings.get(), hk = App.hk, km = App.totalKm(v);
    const lg = v.legs[0] || {}, last = v.legs[v.legs.length - 1] || {};
    const hazards = App.HAZ.map(([k, title, list]) => {
      let rows = ''; for (let i = 0; i < list.length; i += 3) rows += '<tr>' + [0, 1, 2].map((j) => { const l = list[i + j]; return l ? `<td class="hz">${bx(f.haz[hk(l)])} ${esc(l)}</td>` : '<td></td>'; }).join('') + '</tr>';
      return `<tr><th colspan="3">${esc(title)}</th></tr>${rows}`;
    }).join('');
    const steps = (f.steps.length ? f.steps : [{}]).map((st) => `<tr><td>${nl2br(st.step)}</td><td>${nl2br(st.hazard)}</td><td>${['Low', 'Medium', 'High'].map((r) => bx(st.risk === r) + ' ' + r).join('<br>')}</td><td>${nl2br(st.control)}</td><td>${['Yes', 'No', 'N/A'].map((r) => bx(st.done === r) + ' ' + r).join('<br>')}</td></tr>`).join('');
    const state = (arr) => (arr.some((x) => x === 'Needs Repair') ? 'Needs repair' : arr.every((x) => !x) ? '' : 'OK');
    const vi = v.vinsp;
    const crew = f.crew.filter((c) => c.name || c.sig).concat(f.crew.some((c) => c.name || c.sig) ? [] : [{}]);
    const tri = (cur) => ['Yes', 'No', 'N/A'].map((o) => bx(cur === o) + ' ' + o).join(' &nbsp; ');
    return hdr('C.001', 'FORM-001') + kv([['Project name', v.projectName], ['Work area', v.workArea], ['Project address', v.address], ['Supervisor name / phone', v.supervisor]]) +
      `<h3>Describe the task(s) being performed</h3><div class="box">${nl2br(f.taskDesc || v.task)}</div>` +
      `<table class="kv2"><tr><th>Tool box safety topic</th><td>${esc(f.topic)}</td></tr></table>` +
      `<p class="small"><b>See it</b> – what could go wrong? &nbsp; <b>Evaluate it</b> – how bad could it be? &nbsp; <b>Control it</b> – what can I do to fix it?</p>` +
      `<h3>Hazards to consider – check off all that apply</h3><table class="hzt">${hazards}</table>` +
      `<h3>Emergency response checklist</h3>` + kv([['First aid kit location', f.firstAid], ['Fire extinguisher location', f.fireExt], ['Muster point', f.muster], ['Emergency number or radio channel', f.emergNo]]) +
      `<p class="small"><b>Risk ranking:</b> Severity (S) + Probability (P) = Risk Ranking (RR). Severity: 1 – minor first aid injury or damage; 2 – medical treatment or major damage; 3 – lost time, fatality, or catastrophic damage. Probability: A – unlikely; B – may happen; C – highly likely. Eliminate hazards whenever possible; otherwise use the hierarchy of controls: engineering, administrative, PPE, then a combination.</p>` +
      `<h3>Inspection points</h3><table class="ck">${App.FLHA_Q.map((l, i) => `<tr><td>${esc(l)}</td><td>${tri(f.q[i])}</td></tr>`).join('')}<tr><td>Weather description, temperature °C</td><td>${esc(f.weather)}</td></tr><tr><td>Near misses for the day</td><td>${esc(f.nearMiss)}</td></tr></table>` +
      `<h3>PPE required</h3><table class="kv2">` +
      `<tr><th>Footwear</th><td>${tri(p.foot)} &nbsp; ${['6"', '8"', 'Steel toed'].map((o) => bx(p.footSize === o) + ' ' + o).join(' ')}</td><th>Respiratory</th><td>${['N/A', '½ Mask', 'Full Mask'].map((o) => bx(p.resp === o) + ' ' + o).join(' ')} ${p.respType ? '<br>Filter: ' + esc(p.respType) : ''}</td></tr>` +
      `<tr><th>Eyewear</th><td>${tri(p.eye)} &nbsp; ${bx(p.eyeShield)} Face shield</td><th>Coveralls</th><td>${['Coveralls', 'Vest', 'No', 'N/A'].map((o) => bx(p.cov === o) + ' ' + o).join(' ')}</td></tr>` +
      `<tr><th>Gloves</th><td>${tri(p.gloves)} ${p.glovesRating ? '<br>Rating: ' + esc(p.glovesRating) : ''}</td><th>Other (list)</th><td>${esc(p.other)}</td></tr>` +
      `<tr><th>Hard hat</th><td>${tri(p.hat)}</td><td colspan="2"></td></tr></table>` +
      `<h3>Job safety analysis review</h3><table><tr><th>Title</th><th>Notes</th><th>Hazards awareness</th></tr>${(f.jsaReviewed || '').split('\n').filter(Boolean).map((t) => `<tr><td>${esc(t)}</td><td></td><td></td></tr>`).join('') || '<tr><td>&nbsp;</td><td></td><td></td></tr>'}</table>` +
      `<h3>Hazard identification</h3><table class="hzid"><tr><th>Work plan task / action item</th><th>Hazard (actual or potential)</th><th>Risk ranking</th><th>Controls (engineering, administrative, PPE)</th><th>Task complete</th></tr>${steps}</table>` +
      `<h3>Vehicle inspection form</h3><table class="kv2"><tr><th>Vehicle owner, make, model and license plate</th><td colspan="3">${esc([v.vehicle.ownership, v.vehicle.desc, v.vehicle.plate].filter(Boolean).join(' · '))}</td></tr>` +
      `<tr><th>Fluids (fuel, oil, coolant)</th><td>${esc(state([vi.fluids[0], vi.fluids[1], vi.fluids[3]]))}</td><th>Documents (insurance, registration, log book)</th><td>${esc(state([vi.docs[0], vi.docs[1], vi.docs[3]]))}</td></tr>` +
      `<tr><th>Safety (first aid, extinguisher, roadside kit, amber light)</th><td>${esc(state([vi.safety[0], vi.safety[1], vi.safety[3], vi.safety[4]]))}</td><th>Physical damage / notes</th><td>${esc(v.vnotes)}</td></tr>` +
      `<tr><th>KM at sign out</th><td>${esc(lg.odoStart)}</td><th>KM at sign in</th><td>${esc(last.odoEnd)}</td></tr><tr><th>Expenses</th><td colspan="3">${km ? esc(km + ' km × $' + s.rates.km + '/km = ' + money(round2(km * s.rates.km))) : ''}</td></tr></table>` +
      `<h3>Worker sign-off</h3><p class="small">Must be completed before work begins and when workers return to the area. By signing here, you are identified as having been on site and reviewed this field level hazard assessment.</p>` +
      `<table><tr><th>Worker name</th><th>Trade / company</th><th>Signature</th><th>PPE insp. (initial)</th><th>Time in</th><th>Time out</th></tr>` +
      crew.map((c, i) => `<tr><td>${esc(c.name)}</td><td>${esc(c.trade)}</td><td><div class="sigline">${sigImg(c.sig || (i === 0 ? mySig(v) : ''))}</div></td><td>${esc(c.ppe)}</td><td>${esc(c.time_in)}</td><td>${esc(c.time_out)}</td></tr>`).join('') + '</table>' +
      sigTable([['Supervisor name', '', v.supervisor], ['Date', '', D(v)], ['Signature', f.supervisorSig, '']]);
  };

  // ---- C.024 Worksite Inspection
  FORMS['C.024'] = (v) => hdr('C.024') + `<h3>Safety inspection</h3>` + kv([['Project name', v.projectName], ['Project address', v.address], ['Contract no.', v.contractNo], ['Owner', v.owner], ['Client project no.', v.clientProjNo], ['Client rep', v.clientRep]]) +
    `<table class="ck"><tr><th class="c">#</th><th>Inspection point</th><th class="c">Yes</th><th class="c">No</th><th class="c">N/A</th></tr>` +
    App.WS.map((l, i) => `<tr><td class="c">${i + 1}</td><td>${esc(l)}</td>${['Yes', 'No', 'N/A'].map((o) => `<td class="c">${bx(v.ws.items[i] === o)}</td>`).join('')}</tr>`).join('') + '</table>' +
    `<h3>Comments / corrective actions</h3><div class="box tall">${nl2br(v.ws.comments) || '&nbsp;'}</div>` +
    `<h3>Inspector sign off</h3>` + sigTable([['Printed name', '', v.tech], ['Signature', mySig(v), ''], ['Date', '', D(v)]]);

  // ---- C.004 Contractor's Daily Progress Report
  FORMS['C.004'] = (v) => hdr('C.004', 'FORM-004') + `<h3>Contractor's daily progress report</h3>` +
    `<table class="kv2"><tr><th>Project name</th><td>${esc(v.projectName)}</td></tr><tr><th>Contract no.</th><td>${esc(v.contractNo)}</td></tr><tr><th>Contractor</th><td>${esc(Settings.get().company.name)}</td></tr><tr><th>Date</th><td>${D(v)}</td></tr>` +
    `<tr><th>Completed activity</th><td class="tall">${nl2br(v.daily.completed || App.visitDailyText(v))}</td></tr><tr><th>Planned for next week</th><td class="tall">${nl2br(v.daily.planned)}</td></tr></table>` +
    sigTable([['Supervisor', '', v.supervisor || v.clientRep], ['Signature', v.sigClientRep, '']]);

  // ---- C.008 Mileage Cover Sheet
  FORMS['C.008'] = (v) => {
    const rate = Settings.get().rates.km, km = App.totalKm(v);
    const rows = v.legs.map((l) => `<tr><td>${D(v)}</td><td>${esc(l.time)}</td><td>${esc(v.projectName || v.customer)}</td><td>${esc(v.purpose || v.task)}</td><td>${esc(l.from)}</td><td>${esc(l.to)}</td><td class="num">${esc(l.odoStart)}</td><td class="num">${esc(l.odoEnd)}</td><td class="num">${App.legKm(l) || ''}</td></tr>`).join('');
    return hdr('C.008') + kv([['Employee name', v.tech], ['Total mileage (km)', String(km)], ['Rate ($/km)', String(rate)], ['Expense amount', money(round2(km * rate))]]) +
      `<table class="mil"><tr><th>Date</th><th>Time</th><th>Project</th><th>Purpose</th><th>From</th><th>To</th><th>Odometer start</th><th>Odometer finish</th><th>Mileage</th></tr>${rows}` +
      `<tr><th colspan="8" class="num">Total</th><th class="num">${km}</th></tr></table>` + sigTable([['Employee signature', mySig(v), v.tech], ['Date', '', D(v)]]);
  };

  /* ====================================================== package assembly */
  // Fixed order every time: fume hood inspections first, then the forms by number
  const ORDER = ['C.001', 'C.002', 'C.004', 'C.008', 'C.024', 'C.051', 'C.052'];
  const baseName = (v) => `${v.date || 'undated'}_${safeName(v.customer) || 'Customer'}`;
  function docList(v) {
    const base = baseName(v), out = [];
    App.visitHoods(v).forEach((h) => {
      const rec = Object.assign({}, h, { sigTech: h.sigTech || mySig(v) });
      out.push({ code: 'FH', title: 'Fume Hood Inspection – ' + (h.fhId || 'hood'), file: `${base}_FH-${safeName(h.fhId) || 'hood'}_Fume_Hood_Inspection.pdf`, html: M.fh.doc(rec) });
    });
    ORDER.forEach((code) => out.push({ code, title: CTL[code].title, file: `${base}_${code}_${CTL[code].short}.pdf`, html: FORMS[code](v) }));
    return out;
  }
  App.pack = { docList, FORMS, CTL };

  // quick completeness check shown before generating (warnings only — never blocks)
  function checks(v) {
    const n = (a) => a.filter((x) => x !== '' && x != null).length, w = [];
    if (!App.visitHoods(v).length) w.push('No fume hoods added to this visit yet.');
    if (!v.projectName) w.push('Project name is blank (shows on most forms).');
    if (!mySig(v)) w.push('No signature yet — sign in the visit form, or save one in Settings.');
    if (n(v.d360.items) < App.D360.length) w.push(`360 checklist: ${n(v.d360.items)} of ${App.D360.length} answered.`);
    if (n(v.vinsp.safety.concat(v.vinsp.fluids, v.vinsp.docs, v.vinsp.clean)) < 16) w.push('Vehicle inspection has unanswered items.');
    if (!Object.values(v.flha.haz).some(Boolean)) w.push('FLHA: no hazards ticked.');
    if (n(v.ws.items) < App.WS.length) w.push(`Worksite inspection: ${n(v.ws.items)} of ${App.WS.length} answered.`);
    if (!App.totalKm(v)) w.push('Mileage: no odometer readings / kilometres entered.');
    App.visitHoods(v).forEach((h) => { if (h.status !== 'final') w.push(`Hood ${h.fhId || '?'} is still a draft.`); });
    return w;
  }

  /* ============================================================ PDF engine */
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    return (loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Could not load ' + src)); document.head.appendChild(s); }));
  }
  const libs = () => Promise.all(['js/vendor/html2canvas.min.js', 'js/vendor/jspdf.umd.min.js', 'js/vendor/jszip.min.js'].map(loadScript));

  const PX_W = 744;                         // content width in CSS px (Letter 816px − 2×36 margins)
  const PAGE_PX = 960;                      // content height per page in CSS px
  const SCALE = 2;                          // render sharpness
  // Render one document's HTML into an array of page canvases, breaking between rows/blocks
  async function renderPages(html) {
    const host = document.createElement('div'); host.className = 'pdfhost';
    host.innerHTML = `<div class="paper pdfpaper" style="width:${PX_W}px">${html}</div>`;
    document.body.appendChild(host);
    try {
      const el = host.firstElementChild;
      await Promise.all(Array.from(el.querySelectorAll('img')).map((i) => (i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; }))));
      const total = el.scrollHeight, top = el.getBoundingClientRect().top;
      // candidate break points = bottoms of table rows and headings
      const cands = Array.from(el.querySelectorAll('tr, h3, h4, p, .dh, .box')).map((n) => Math.round(n.getBoundingClientRect().bottom - top)).filter((y) => y > 0).sort((a, b) => a - b);
      const full = await window.html2canvas(el, { scale: SCALE, backgroundColor: '#ffffff', useCORS: true, logging: false, windowWidth: PX_W });
      const pages = []; let y0 = 0;
      while (y0 < total - 2) {
        let y1 = Math.min(total, y0 + PAGE_PX);
        if (y1 < total) { const ok = cands.filter((c) => c > y0 + PAGE_PX * 0.45 && c <= y1); if (ok.length) y1 = ok[ok.length - 1]; }
        const c = document.createElement('canvas'); c.width = full.width; c.height = Math.max(1, Math.round((y1 - y0) * SCALE));
        const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(full, 0, Math.round(y0 * SCALE), full.width, c.height, 0, 0, full.width, c.height);
        pages.push({ canvas: c, h: y1 - y0 }); y0 = y1;
      }
      return pages;
    } finally { host.remove(); }
  }
  // Build one PDF (Blob) from a document
  async function makePdf(d, v) {
    const { jsPDF } = window.jspdf, pages = await renderPages(d.html);
    const pdf = new jsPDF({ unit: 'pt', format: 'letter', compress: true });
    pdf.setProperties({ title: `${d.title} – ${v.customer} – ${v.date}`, author: v.tech || 'DS Home Computing Ltd.', creator: 'DSHC Field Forms' });
    const clean = (s) => String(s || '').replace(/[^\x20-\x7E·–—]/g, '');
    pages.forEach((pg, i) => {
      if (i) pdf.addPage();
      pdf.addImage(pg.canvas.toDataURL('image/jpeg', 0.88), 'JPEG', 27, 30, PX_W * 0.75, pg.h * 0.75, undefined, 'FAST');
      pdf.setFontSize(8); pdf.setTextColor(110);
      pdf.text(clean(`${d.code === 'FH' ? 'Fume hood inspection' : d.code + ' ' + CTL[d.code].title} · ${v.customer} · ${v.date}`), 27, 770);
      pdf.text(`Page ${i + 1} of ${pages.length}`, 585, 770, { align: 'right' });
    });
    return pdf.output('blob');
  }

  /* ----- keep the rest of the app in step after the package is made ----- */
  async function afterMake(v) {
    const s = Settings.get(), c = Store.all('cust').find((x) => norm(x.name) === norm(v.customer));
    // remember site + vehicle details for next time (fill blanks only)
    if (c) {
      const map = { projectName: v.projectName, siteAddress: v.address, contractNo: v.contractNo, clientProjNo: v.clientProjNo, owner: v.owner, clientRep: v.clientRep, supervisor: v.supervisor, workArea: v.workArea };
      let ch = false; Object.keys(map).forEach((k) => { if (!c[k] && map[k]) { c[k] = map[k]; ch = true; } }); if (ch) await Store.save(c);
    } else if (v.customer) {
      const n = M.cust.blank(); Object.assign(n, { name: v.customer, projectName: v.projectName, siteAddress: v.address, contractNo: v.contractNo, clientProjNo: v.clientProjNo, owner: v.owner, clientRep: v.clientRep, supervisor: v.supervisor, workArea: v.workArea }); await Store.save(n);
    }
    if (v.vehicle.desc && !s.vehicle.desc) await Settings.set('vehicle', v.vehicle);
    if (v.legs[0] && v.legs[0].from && !s.tripFrom) await Settings.set('tripFrom', v.legs[0].from);
    // mileage → expense entry (so it lands on the invoice); updated in place on re-make
    const km = App.totalKm(v);
    if (km > 0) {
      let e = v.expId ? Store.get(v.expId) : null;
      if (!e) { e = M.exp.blank(); v.expId = e.id; }
      if (!e.billedTo) Object.assign(e, { date: v.date, customer: v.customer, jobNo: v.contractNo || v.clientProjNo, category: 'Mileage', km: String(km), rate: String(s.rates.km), amount: String(round2(km * s.rates.km)),
        desc: `Mileage ${km} km @ $${s.rates.km}/km`, from: v.legs[0].from, to: v.legs[v.legs.length - 1].to, visitId: v.id });
      await Store.save(e);
    }
    v.pdfAt = nowIso(); await Store.save(v);
  }

  /* ================================================================== pages */
  const state = { id: null, files: [], zip: null, urls: [] };
  const kb = (b) => (b / 1024 > 1024 ? (b / 1048576).toFixed(1) + ' MB' : Math.round(b / 1024) + ' KB');
  const fileObj = (f) => new File([f.blob], f.name, { type: f.blob.type });

  route(/^#\/pack\/([\w-]+)$/, async (id) => {
    const v = Store.get(id); if (!v || v.type !== 'visit') { toast('Visit not found'); location.replace('#/home'); return; }
    setHeader({ title: 'PDF package', back: '#/edit/visit/' + id });
    if (state.id !== id) { state.urls.forEach((u) => URL.revokeObjectURL(u)); Object.assign(state, { id, files: [], zip: null, urls: [] }); }
    const docs = docList(v), warn = checks(v);
    view(v, docs, warn);
  });
  function view(v, docs, warn) {
    const done = state.files.length > 0;
    $('#view').innerHTML =
      `<div class="card pad"><h3 style="margin-top:0">${esc(v.customer)} · ${esc(fmtDate(v.date))}</h3><p class="muted small">${docs.length} PDFs in this package: ${App.visitHoods(v).length} fume hood inspection${App.visitHoods(v).length === 1 ? '' : 's'} + the 7 forms (C.001, C.002, C.004, C.008, C.024, C.051, C.052).</p>` +
      (warn.length ? `<div class="hint warn"><b>Worth a look before you send it:</b><ul>${warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul><a class="btn sm" href="#/edit/visit/${v.id}">Go back and fix</a></div>` : '<div class="hint ok">Everything looks complete.</div>') +
      `<div id="pk-prog" class="muted small" aria-live="polite"></div>` +
      `<div class="row"><button class="btn primary grow" data-act="packMake">${done ? 'Make the PDFs again' : 'Create PDFs (ZIP)'}</button><a class="btn" href="#/packview/${v.id}">Preview / print</a></div></div>` +
      (done ? resultHtml() : '') +
      `<div class="card pad"><b>What is in the package</b><ol class="small" style="padding-left:1.2rem">${docs.map((d) => `<li>${esc(d.file)}</li>`).join('')}</ol></div>`;
  }
  function resultHtml() {
    const canShare = !!(navigator.canShare && state.zip && navigator.canShare({ files: [fileObj(state.zip)] }));
    return `<div class="card pad"><h3 style="margin-top:0">Ready ✓</h3><div class="row">` +
      `<button class="btn primary grow" data-act="packDownload">Download ZIP (${kb(state.zip.blob.size)})</button>${canShare ? '<button class="btn grow" data-act="packShare">Share…</button>' : ''}</div>` +
      state.files.map((f, i) => `<div class="item"><span class="main"><b>${esc(f.name.replace(baseName(Store.get(state.id)) + '_', ''))}</b><small>${kb(f.blob.size)}</small></span><a class="btn sm" href="${f.url}" target="_blank" rel="noopener">Open</a><button class="btn sm" data-act="packOne" data-i="${i}">Save</button></div>`).join('') + '</div>';
  }
  const saveBlob = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); };

  act.packMake = async (btn) => {
    const v = Store.get(state.id); if (!v) return;
    btn.disabled = true; const prog = $('#pk-prog');
    try {
      prog.textContent = 'Loading PDF tools…'; await libs();
      const docs = docList(v), files = [], zip = new window.JSZip();
      state.urls.forEach((u) => URL.revokeObjectURL(u)); state.urls = [];
      for (let i = 0; i < docs.length; i++) {
        prog.textContent = `Creating PDF ${i + 1} of ${docs.length}: ${docs[i].title}…`;
        await new Promise((r) => setTimeout(r, 30));                       // let the progress text paint on slow phones
        const blob = await makePdf(docs[i], v), url = URL.createObjectURL(blob);
        state.urls.push(url); files.push({ name: docs[i].file, blob, url }); zip.file(docs[i].file, blob);
      }
      prog.textContent = 'Bundling ZIP…';
      const zb = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      state.files = files; state.zip = { name: `${baseName(v)}_Site_Visit_PDFs.zip`, blob: zb };
      await afterMake(v); toast('PDFs ready');
    } catch (err) {
      console.error(err); toast('Could not make PDFs here: ' + err.message + ' — use Preview / print instead.', 6000);
    }
    view(v, docList(v), checks(v));
  };
  act.packDownload = () => saveBlob(state.zip.blob, state.zip.name);
  act.packOne = (el) => { const f = state.files[+el.dataset.i]; saveBlob(f.blob, f.name); };
  act.packShare = async () => {
    try { await navigator.share({ files: [fileObj({ blob: state.zip.blob, name: state.zip.name })], title: state.zip.name }); } catch (e) { if (e.name !== 'AbortError') toast('Sharing is not available — use Download'); }
  };

  // on-screen preview of every document (also the browser-print fallback)
  route(/^#\/packview\/([\w-]+)$/, async (id) => {
    const v = Store.get(id); if (!v) { location.replace('#/home'); return; }
    setHeader({ title: 'Package preview', back: '#/pack/' + id }); Ctx.mode = 'view';
    $('#view').innerHTML = `<div class="toolbar"><button class="btn primary" data-act="print" data-name="${esc(baseName(v) + '_Site_Visit')}">Print / Save one PDF</button></div>` +
      docList(v).map((d) => `<div class="paper pk-page">${d.html}</div>`).join('');
  });
})();
