/* ==========================================================================
   modules.js — one module per record type: blank record, form, list row,
   and the hooks that make the form smart (auto-hours, averages, totals).
   Printable documents for each module live in docs.js.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { $, $$, esc, uid, nowIso, norm, num, round2, money, today, fmtDate, addDays, pad, getPath, setPath, toast, confirmBox, modal, closeModal, C, Store, Settings, Ctx, act } = App;
  const base = (type, extra) => Object.assign({ id: uid(), type, created: nowIso(), status: 'draft' }, extra);
  const byName = (a, b) => norm(a.name).localeCompare(norm(b.name));
  // <datalist> of saved customer names so the customer box autocompletes
  const custList = () => `<datalist id="dl-cust">${Store.all('cust').sort(byName).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>`;
  const badge = (text, cls) => ({ text, cls });

  /* ======================================================================
     FUME HOOD INSPECTION
     Fields mirror your ME Global report + the Access/Excel columns, so the
     CSV export/import lines up with "Previous Inspections.xlsx".
     ====================================================================== */
  const COND = ['Good', 'Fair', 'Poor', 'N/A'];
  const ROWS = [['r18', '18 in'], ['r9', '9 in'], ['r0', '0 in']];       // same row labels as your 1-18 / 1-9 / 1-0 columns
  const DEFICIENCY_CHIPS = [
    'Light does not work', 'Alarm not activated', 'Alarm not calibrated', 'Vinyl coating on cables cracking', 'Cable frayed',
    'Sash rubs on rubber seal', 'Sash is stiff – lubricate', 'Weight chatters', 'Baffle missing / removed', 'No air foil (CSA 4.3.1)',
    'Work surface / marine edge (CSA 4.3.2.1)', 'Cup sink (CSA 4.3.4.4)', 'Exhaust fan (CSA 4.3.7.4)', 'Wood construction (CSA 4.1.6)', 'Low face velocity',
  ];
  function fhStats(r) {
    const vals = [];
    ROWS.forEach(([k]) => ((r.readings && r.readings[k]) || []).forEach((v) => { if (String(v).trim() !== '' && isFinite(parseFloat(v))) vals.push(parseFloat(v)); }));
    const n = vals.length, total = vals.reduce((a, b) => a + b, 0);
    return { n, total, avg: n ? total / n : 0 };
  }
  function fhVerdict(st) {
    if (!st.n) return null;
    const f = Settings.get().fh;
    if (st.avg < f.minFpm) return { cls: 'bad', text: `Average is below the ${f.minFpm}–${f.maxFpm} fpm reference range` };
    if (st.avg > f.maxFpm) return { cls: 'warn', text: `Average is above the ${f.minFpm}–${f.maxFpm} fpm reference range` };
    return { cls: 'ok', text: `Average is within the ${f.minFpm}–${f.maxFpm} fpm reference range` };
  }
  App.fhStats = fhStats; App.fhVerdict = fhVerdict; App.ROWS = ROWS; App.COND = COND;
  const statsHtml = (r) => {
    const st = fhStats(r), v = fhVerdict(st);
    return `<div class="stats"><span class="stat">Readings <b>${st.n}</b></span><span class="stat">Total <b>${Math.round(st.total).toLocaleString('en-CA')}</b></span>` +
      `<span class="stat">Average <b>${st.n ? Math.round(st.avg) : '–'}</b> fpm</span>${v ? `<span class="pill ${v.cls}">${v.cls === 'ok' ? 'In range' : v.cls === 'bad' ? 'Low' : 'High'}</span>` : ''}</div>`;
  };
  // "Last inspected …" helper so you can compare against the previous visit on site
  function prevHint(r) {
    if (!r.fhId || !r.customer) return '';
    const prev = Store.all('fh').filter((x) => x.id !== r.id && norm(x.fhId) === norm(r.fhId) && norm(x.customer) === norm(r.customer))
      .sort((a, b) => String(b.completed || b.issued || '').localeCompare(String(a.completed || a.issued || '')))[0];
    if (!prev) return '';
    const st = fhStats(prev);
    return `Last inspected <b>${esc(fmtDate(prev.completed || prev.issued))}</b>${st.n ? ` — average ${Math.round(st.avg)} fpm (${st.n} readings)` : ''}.` +
      `${prev.deficiencies ? ` Previous deficiencies: ${esc(prev.deficiencies)}` : ''}`;
  }

  App.modules.fh = {
    key: 'fh', name: 'Fume Hood Inspection', plural: 'Fume hood inspections', icon: 'fh',
    blank(q) {
      const s = Settings.get();
      const vid = q && q.get ? q.get('visit') : '', vis = vid ? Store.get(vid) : null;        // started from a site visit → carry its details over
      const rec = base('fh', {
        customer: '', lab: '', fhId: '', manufacturer: '', serial: '', width: '', height: '', clientRef: '', wo: '',
        magnehelic: '', alarm: '', alarmModel: '', baffle: '', sash: '', liner: '', workSurface: '', cable: '', rollers: '',
        tech: s.tech.name, issued: today(), completed: today(),
        readings: { r18: Array(8).fill(''), r9: Array(8).fill(''), r0: Array(8).fill('') },
        comments: '', deficiencies: '', photos: [], sigTech: '', clientName: '', sigClient: '',
      });
      if (vis) {
        Object.assign(rec, { visitId: vis.id, customer: vis.customer, lab: vis.workArea || '', clientRef: vis.clientProjNo || '', tech: vis.tech || rec.tech, issued: vis.date, completed: vis.date, clientName: vis.clientRep || '' });
        const prev = Store.all('fh').filter((h) => h.visitId === vis.id).pop(); if (prev) { rec.manufacturer = prev.manufacturer; rec.lab = prev.lab || rec.lab; }
      }
      return rec;
    },
    backHash: (r) => (r.visitId ? '#/edit/visit/' + r.visitId : '#/list/fh'),
    item(r) {
      const st = fhStats(r), v = fhVerdict(st);
      return { title: `${r.fhId || 'New hood'}${r.customer ? ' — ' + r.customer : ''}`, sub: [r.lab, fmtDate(r.completed || r.issued), st.n ? `avg ${Math.round(st.avg)} fpm` : ''].filter(Boolean).join(' · '),
        badge: badge(r.status === 'final' ? (v && v.cls !== 'ok' ? (v.cls === 'bad' ? 'Low flow' : 'High flow') : 'Complete') : 'Draft', r.status === 'final' ? (v && v.cls === 'bad' ? 'bad' : v && v.cls === 'warn' ? 'warn' : 'ok') : ''), date: r.completed || r.issued };
    },
    fileName: (r) => `${r.customer || 'Customer'}_${r.fhId || 'FH'}_${(r.completed || r.issued || '').replace(/-/g, '')}${r.clientRef ? '-' + r.clientRef : ''}`,
    validate: (r) => (!r.customer || !r.fhId ? 'Add the customer and fume hood ID first' : ''),
    form(r) {
      const cond = (label, path) => C.seg(label, path, r, COND);
      const readings = ROWS.map(([k, lab]) =>
        `<div class="rrow"><b>${lab}</b><div class="rgrid">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
          `<label><i>${i + 1}</i><input data-f="readings.${k}.${i}" type="number" inputmode="decimal" step="any" value="${esc(getPath(r, 'readings.' + k + '.' + i))}"></label>`).join('')}</div></div>`).join('');
      return custList() + `<div class="hint" id="fh-prev">${prevHint(r)}</div>` +
        C.sec('equip', 'Equipment',
          `<div class="grid2">${C.text('Customer', 'customer', r, { list: 'dl-cust' })}${C.text('Lab / room', 'lab', r)}${C.text('Fume hood ID', 'fhId', r, { ph: 'e.g. FE607' })}` +
          `${C.text('Manufacturer', 'manufacturer', r, { list: 'dl-mfr' })}${C.text('Serial number', 'serial', r)}${C.text('Width (in)', 'width', r, { list: 'dl-width', mode: 'numeric' })}` +
          `${C.text('Client reference / PO', 'clientRef', r)}${C.text('Work order #', 'wo', r)}</div>`) +
        C.sec('cond', 'Condition',
          `${cond('Baffle', 'baffle')}${cond('Sash', 'sash')}${cond('Liner', 'liner')}${cond('Work surface', 'workSurface')}${cond('Cable', 'cable')}${cond('Rollers', 'rollers')}` +
          `<div class="grid2">${C.quick('Alarm', 'alarm', r, ['Good', 'Poor', 'N/A'], { ph: 'Good / Poor / reading' })}${C.text('Alarm model', 'alarmModel', r, { list: 'dl-alarm' })}` +
          `${C.quick('Magnehelic gauge', 'magnehelic', r, ['N/A', 'Good'], { ph: 'e.g. 0.5 in' })}</div>`) +
        C.sec('flow', 'Face velocity (fpm)', `${readings}<div id="fh-stats">${statsHtml(r)}</div><p class="muted small" id="fh-verdict">${(fhVerdict(fhStats(r)) || { text: '' }).text}</p>`) +
        C.sec('find', 'Findings',
          `${C.area('Comments', 'comments', r)}${C.area('Deficiencies', 'deficiencies', r)}<span class="muted small">Tap to add a common deficiency:</span>${C.addChips('deficiencies', DEFICIENCY_CHIPS)}`) +
        C.sec('photos', 'Photos', C.photos('Deficiency / hood photos', 'photos', r), { badge: (r.photos || []).length ? String(r.photos.length) : '' }) +
        C.sec('sign', 'Sign-off',
          `<div class="grid2">${C.text('Technician', 'tech', r)}${C.date('Issued', 'issued', r)}${C.date('Completed', 'completed', r)}</div>` +
          `${C.sig('Technician signature', 'sigTech', r)}${C.text('Client representative (optional)', 'clientName', r)}${C.sig('Client signature (optional)', 'sigClient', r)}`);
    },
    bar: (r) => (r && r.visitId
      ? '<button class="btn" data-act="fhNext">Next hood</button><button class="btn primary" data-act="hoodDone">Done – back to visit</button>'
      : '<button class="btn" data-act="preview">Preview / PDF</button><button class="btn" data-act="fhNext">Next hood</button><button class="btn primary" data-act="complete">Mark complete</button>'),
    onChange(r, path) {
      if (path === 'fhId' || path === 'customer') { const el = $('#fh-prev'); if (el) el.innerHTML = prevHint(r); }
      if (path.indexOf('readings.') === 0) {
        const el = $('#fh-stats'); if (el) el.innerHTML = statsHtml(r);
        const v = $('#fh-verdict'); if (v) v.textContent = (fhVerdict(fhStats(r)) || { text: '' }).text;
      }
    },
  };
  // Hood belongs to a site visit: mark it complete and return to the visit
  act.hoodDone = async () => {
    const r = Ctx.rec, msg = Ctx.mod.validate(r); if (msg) { toast(msg); return; }
    r.status = 'final'; await App.saveNow(); location.hash = '#/edit/visit/' + r.visitId;
  };
  // "Next hood": finish this one and open a fresh form that keeps the visit details
  act.fhNext = async () => {
    const r = Ctx.rec, mod = Ctx.mod; const msg = mod.validate(r); if (msg) { toast(msg); return; }
    r.status = 'final'; await App.saveNow();
    const n = mod.blank();
    ['customer', 'lab', 'clientRef', 'wo', 'tech', 'issued', 'completed', 'manufacturer', 'visitId', 'clientName'].forEach((k) => { n[k] = r[k]; });
    Ctx.pending[n.id] = n; location.hash = '#/edit/fh/' + n.id;
  };

  /* ======================================================================
     JOB SAFETY ANALYSIS (field-level hazard assessment)
     Starter content is drawn from your NORLAB-SWP-0006 cable-replacement
     procedure and typical fume hood inspection tasks. Review it against
     your own safety program before relying on it.
     ====================================================================== */
  const JSA_TEMPLATES = {
    inspect: { label: 'Fume hood inspection', steps: [
      { step: 'Travel to site, sign in, meet escort', hazard: 'Vehicle collision; unfamiliar site hazards; unescorted access', control: 'Pre-trip vehicle check; attend site orientation; sign in and stay with escort; follow site rules and PPE signage', risk: 'Low' },
      { step: 'Review fume hood and surrounding area', hazard: 'Chemical residue or spills on work surface; unlabelled containers; contaminated surfaces', control: 'Client confirms hood is cleared / decontaminated; check WHMIS labels and SDS; do not move or open containers; wear gloves and safety glasses', risk: 'Medium' },
      { step: 'Measure face velocity at the sash opening', hazard: 'Reaching into hood; contact with equipment inside; sash movement', control: 'Have client move equipment first; set sash to marked height; keep hands clear of sash path; handle instrument carefully', risk: 'Low' },
      { step: 'Inspect sash, cables, rollers, baffles, liner', hazard: 'Pinch points; sharp edges; falling sash or counterweight', control: 'Wear cut-resistant gloves; keep hands clear of moving parts; support sash when raised; do not stand under raised sash', risk: 'Medium' },
      { step: 'Check alarm, light and gauge', hazard: 'Electrical shock; hot surfaces', control: 'Do not open electrical panels or wiring; report faults to client; lock out where required', risk: 'Low' },
      { step: 'Use of ladder / step stool for ceiling-height checks', hazard: 'Fall from height; overreaching', control: 'Inspect ladder before use; three points of contact; do not overreach; have a second person hold it', risk: 'Medium' },
    ] },
    cable: { label: 'Sash cable replacement (SWP-0006)', steps: [
      { step: 'Remove upper then lower baffle; lower sash completely', hazard: 'Sharp edges; pinch points; dropped panels', control: 'Cut-resistant gloves; two-person handling of panels; set panels down away from work area', risk: 'Medium' },
      { step: 'Clamp cables with vice grips behind the front roller; support sash with sleepers 12–16 in above the bottom', hazard: 'Sash drops; hands caught in cable path; counterweight movement', control: 'Second person on each side; sleepers fully seated before releasing sash; keep hands clear of rollers and cable', risk: 'High' },
      { step: 'Release vice grips and slowly lower counterweight to bottom', hazard: 'Falling counterweight; pinch / crush injury', control: 'Controlled lowering by two people; keep body out of weight travel path; do not release clamps until both sides are supported', risk: 'High' },
      { step: 'Cut access hole in back panel (at least 6 in from marked centre)', hazard: 'Cuts; metal shavings; dust; tool kickback', control: 'Gloves, safety glasses and hearing protection as needed; secure the panel; vacuum debris', risk: 'Medium' },
      { step: 'Remove damaged cable, thread new cable over rollers and centre pin', hazard: 'Working at ceiling height; sharp cable ends; overreaching', control: 'Stable ladder / platform; tape cable ends; use fish wire from ceiling; do not overreach', risk: 'Medium' },
      { step: 'Set loops, attach to sash pull, level sash, tighten horseshoe clamp', hazard: 'Pinched fingers; uneven sash movement; clamp slip', control: 'Test sash travel slowly with both people present; check cable touches rollers only; re-check clamp is tight', risk: 'Medium' },
      { step: 'Fit stainless cover over access hole; reinstall lower then upper baffle; cleanup', hazard: 'Sharp edges; manual handling; slips on debris', control: 'Gloves; team lift; remove tools and debris; return hood to client in safe working order', risk: 'Low' },
    ] },
    blank: { label: 'Blank', steps: [{ step: '', hazard: '', control: '', risk: '' }] },
  };
  const PPE = [['hardhat', 'Hard hat'], ['glasses', 'Safety glasses'], ['gloves', 'Gloves (chemical / cut)'], ['boots', 'Safety footwear'], ['hivis', 'Hi-vis vest'], ['hearing', 'Hearing protection'], ['resp', 'Respirator'], ['coveralls', 'Lab coat / coveralls'], ['shield', 'Face shield'], ['fall', 'Fall protection']];
  App.PPE = PPE; App.JSA_TEMPLATES = JSA_TEMPLATES;

  App.modules.jsa = {
    key: 'jsa', name: 'Job Safety Analysis', plural: 'Job safety analyses', icon: 'jsa',
    blank() {
      const s = Settings.get();
      return base('jsa', {
        jsaNo: 'JSA-' + pad((s.counters.jsa || 0) + 1, 4), date: today(), time: '', client: '', site: '', workDesc: 'Fume hood inspection / service', supervisor: '', permit: '',
        ppe: { glasses: true, gloves: true, boots: true }, ppeOther: '',
        steps: JSA_TEMPLATES.inspect.steps.map((x) => Object.assign({}, x)),
        crew: [{ name: s.tech.name, sig: '' }], emergency: { contact: '', phone: '', muster: '', firstAid: '' },
        fit: false, reviewed: false, stopWork: false, notes: '',
      });
    },
    afterFirstSave() { Settings.bump('jsa'); },
    item(r) { return { title: `${r.jsaNo} — ${r.client || r.site || 'JSA'}`, sub: [fmtDate(r.date), r.workDesc].filter(Boolean).join(' · '), badge: badge(r.status === 'final' ? 'Signed' : 'Draft', r.status === 'final' ? 'ok' : ''), date: r.date }; },
    fileName: (r) => `${r.jsaNo}_${r.client || 'JSA'}_${(r.date || '').replace(/-/g, '')}`,
    validate: (r) => (!(r.crew || []).some((c) => c.name) ? 'Add at least one crew member' : (!r.reviewed ? 'Confirm the hazards were reviewed with the crew' : '')),
    form(r) {
      const steps = (r.steps || []).map((s, i) =>
        `<div class="rowcard"><div class="head"><b>Step ${i + 1}</b><button type="button" class="link danger" data-act="jsaDel" data-i="${i}">Remove</button></div>` +
        `${C.area('Task step', `steps.${i}.step`, r, { rows: 2 })}${C.area('Hazards', `steps.${i}.hazard`, r, { rows: 2 })}${C.area('Controls', `steps.${i}.control`, r, { rows: 3 })}` +
        `${C.seg('Residual risk after controls', `steps.${i}.risk`, r, ['Low', 'Medium', 'High'])}</div>`).join('');
      const crew = (r.crew || []).map((c, i) =>
        `<div class="rowcard"><div class="head"><b>Crew member ${i + 1}</b>${(r.crew || []).length > 1 ? `<button type="button" class="link danger" data-act="crewDel" data-i="${i}">Remove</button>` : ''}</div>${C.text('Name', `crew.${i}.name`, r)}${C.sig('Signature', `crew.${i}.sig`, r)}</div>`).join('');
      return `<div class="hint warn">Starter hazards and controls are based on your SWP-0006 and typical fume hood tasks — review them against your safety program for each job.</div>` +
        C.sec('job', 'Job details',
          `<div class="grid2">${C.text('JSA number', 'jsaNo', r)}${C.date('Date', 'date', r)}${C.time('Time', 'time', r)}${C.text('Client', 'client', r)}${C.text('Site / location', 'site', r)}${C.text('Supervisor / site contact', 'supervisor', r)}${C.text('Permit / work order reference', 'permit', r)}</div>${C.area('Work being done', 'workDesc', r, { rows: 2 })}`) +
        C.sec('steps', 'Task steps, hazards and controls',
          `<div class="row" style="margin-bottom:.6rem"><button type="button" class="btn sm" data-act="jsaTpl" data-t="inspect">Load: Inspection</button><button type="button" class="btn sm" data-act="jsaTpl" data-t="cable">Load: Cable replacement</button><button type="button" class="btn sm" data-act="jsaTpl" data-t="blank">Blank</button></div>` +
          `${steps}<button type="button" class="btn block" data-act="jsaAdd">+ Add step</button>`, { badge: String((r.steps || []).length) }) +
        C.sec('ppe', 'PPE required', `<div class="grid2">${PPE.map(([k, l]) => C.chk(l, 'ppe.' + k, r)).join('')}</div>${C.text('Other PPE / notes', 'ppeOther', r)}`) +
        C.sec('emerg', 'Emergency information', `<div class="grid2">${C.text('Site emergency contact', 'emergency.contact', r)}${C.text('Emergency phone', 'emergency.phone', r, { type: 'tel' })}${C.text('Muster point', 'emergency.muster', r)}${C.text('First aid / eyewash location', 'emergency.firstAid', r)}</div>`) +
        C.sec('crew', 'Crew sign-on', `${crew}<button type="button" class="btn block" data-act="crewAdd">+ Add crew member</button>`, { badge: String((r.crew || []).length) }) +
        C.sec('close', 'Confirmations',
          `${C.chk('Hazards and controls reviewed with the crew', 'reviewed', r)}${C.chk('Everyone is fit for work', 'fit', r)}${C.chk('Crew knows they can stop work if conditions change', 'stopWork', r)}${C.area('Notes / changes during the job', 'notes', r)}`);
    },
    bar: () => '<button class="btn" data-act="preview">Preview / PDF</button><button class="btn primary" data-act="complete">Mark signed</button>',
  };
  act.jsaAdd = () => { Ctx.rec.steps.push({ step: '', hazard: '', control: '', risk: '' }); App.changed('steps'); App.renderForm(); };
  act.jsaDel = (el) => { Ctx.rec.steps.splice(+el.dataset.i, 1); App.changed('steps'); App.renderForm(); };
  act.crewAdd = () => { Ctx.rec.crew.push({ name: '', sig: '' }); App.changed('crew'); App.renderForm(); };
  act.crewDel = (el) => { Ctx.rec.crew.splice(+el.dataset.i, 1); App.changed('crew'); App.renderForm(); };
  act.jsaTpl = async (el) => {
    const t = JSA_TEMPLATES[el.dataset.t], has = (Ctx.rec.steps || []).some((s) => s.step || s.hazard || s.control);
    if (has && !(await confirmBox('Replace the current steps with the "' + t.label + '" template?', 'Replace', false))) return;
    Ctx.rec.steps = t.steps.map((x) => Object.assign({}, x));
    if (el.dataset.t === 'cable') Ctx.rec.workDesc = 'Fume hood sash cable replacement';
    if (el.dataset.t === 'inspect') Ctx.rec.workDesc = 'Fume hood inspection / service';
    App.changed('steps'); App.renderForm();
  };

  /* ======================================================================
     VEHICLE INSPECTION (daily pre-trip / post-trip)
     No vehicle form was in the folder, so this is a standard walk-around
     checklist — not an official NSC form. Adjust the items to suit.
     ====================================================================== */
  const VEH_GROUPS = [
    ['ext', 'Exterior walk-around', ['Lights – head, tail, brake, signals', 'Tires, wheels and lug nuts', 'Windshield, wipers and washer', 'Mirrors', 'Body damage, doors and hood latch', 'Fluid leaks under vehicle', 'Licence plate']],
    ['cab', 'Cab and controls', ['Brakes – service and parking', 'Steering', 'Horn', 'Seat belts', 'Gauges and warning lights', 'Heater / defroster']],
    ['hood', 'Under the hood', ['Engine oil', 'Coolant', 'Washer fluid', 'Brake / power-steering fluid', 'Belts and hoses', 'Battery']],
    ['safety', 'Safety equipment', ['Fire extinguisher (charged)', 'First aid kit', 'Emergency kit / triangles', 'Spill kit (if carried)']],
    ['cargo', 'Cargo and tools', ['Load secured', 'Ladders and tools secured', 'Instruments (anemometer etc.) stowed']],
    ['docs', 'Documents', ['Registration', 'Insurance card']],
  ];
  App.VEH_GROUPS = VEH_GROUPS;
  const VEH_OPTS = [['ok', 'OK'], ['defect', 'Defect'], ['na', 'N/A']];
  const vehDefects = (r) => { let n = 0; VEH_GROUPS.forEach(([k]) => ((r.items && r.items[k]) || []).forEach((v) => { if (v === 'defect') n++; })); return n; };
  App.vehDefects = vehDefects;
  App.modules.veh = {
    key: 'veh', name: 'Vehicle Inspection', plural: 'Vehicle inspections', icon: 'veh',
    blank() {
      const items = {}; VEH_GROUPS.forEach(([k, , list]) => { items[k] = Array(list.length).fill(''); });
      return base('veh', { kind: 'Pre-trip', date: today(), time: '', driver: Settings.get().tech.name, vehicle: '', plate: '', odometer: '', location: '', items, defects: '', action: '', safe: '', sigDriver: '' });
    },
    item(r) { const d = vehDefects(r); return { title: `${r.vehicle || 'Vehicle'} — ${r.kind || 'Inspection'}`, sub: [fmtDate(r.date), r.driver, r.odometer ? r.odometer + ' km' : ''].filter(Boolean).join(' · '), badge: badge(d ? d + ' defect' + (d > 1 ? 's' : '') : (r.status === 'final' ? 'Pass' : 'Draft'), d ? 'bad' : r.status === 'final' ? 'ok' : ''), date: r.date }; },
    fileName: (r) => `Vehicle_${r.vehicle || 'inspection'}_${(r.date || '').replace(/-/g, '')}`,
    validate: (r) => (!r.vehicle || !r.driver ? 'Add the vehicle and driver first' : (!r.safe ? 'Say whether the vehicle is safe to operate' : '')),
    form(r) {
      const groups = VEH_GROUPS.map(([k, title, list]) =>
        C.sec('g-' + k, title,
          `<div class="row end" style="margin-bottom:.3rem"><button type="button" class="link" data-act="vehAllOk" data-g="${k}">Mark all OK</button></div>` +
          list.map((label, i) => `<div class="vrow"><span>${esc(label)}</span>${C.seg('', `items.${k}.${i}`, r, VEH_OPTS, { mini: true })}</div>`).join(''))).join('');
      const d = vehDefects(r);
      return C.sec('info', 'Vehicle and driver',
        `${C.seg('Inspection', 'kind', r, ['Pre-trip', 'Post-trip'])}<div class="grid2">${C.date('Date', 'date', r)}${C.time('Time', 'time', r)}${C.text('Driver', 'driver', r)}${C.text('Vehicle (unit / description)', 'vehicle', r)}${C.text('Licence plate', 'plate', r)}${C.text('Odometer (km)', 'odometer', r, { mode: 'numeric' })}${C.text('Location', 'location', r)}</div>`) +
        groups +
        C.sec('result', 'Defects and sign-off',
          `<div class="hint ${d ? 'bad' : ''}" id="veh-hint">${d ? `${d} defect${d > 1 ? 's' : ''} marked — describe it below and confirm whether the vehicle is safe to operate.` : ''}</div>` +
          `${C.area('Defects found', 'defects', r)}${C.area('Action taken / reported to', 'action', r, { rows: 2 })}${C.seg('Vehicle is safe to operate', 'safe', r, ['Yes', 'No'])}${C.sig('Driver signature', 'sigDriver', r)}`);
    },
    bar: () => '<button class="btn" data-act="preview">Preview / PDF</button><button class="btn primary" data-act="complete">Mark complete</button>',
    onChange(r, path) {
      if (path.indexOf('items.') === 0) { const d = vehDefects(r), h = $('#veh-hint'); if (h) { h.className = 'hint ' + (d ? 'bad' : ''); h.textContent = d ? `${d} defect${d > 1 ? 's' : ''} marked — describe it below and confirm whether the vehicle is safe to operate.` : ''; } }
    },
  };
  act.vehAllOk = (el) => { const k = el.dataset.g, arr = Ctx.rec.items[k]; for (let i = 0; i < arr.length; i++) if (!arr[i]) arr[i] = 'ok'; App.changed('items.' + k); App.renderForm(); };

  /* ======================================================================
     SITE INSPECTION
     Site-access details (from your Site Access form) plus a pre-job
     conditions checklist.
     ====================================================================== */
  const SITE_CHECKS = [
    ['access', 'Sign-in and escort arranged'], ['orient', 'Site orientation / safety briefing received'],
    ['emerg', 'Emergency exits, muster point, eyewash and first aid located'], ['area', 'Work area accessible and clear'],
    ['decon', 'Fume hood contents cleared / decontaminated by client'], ['light', 'Lighting adequate'],
    ['vent', 'Room ventilation / HVAC operating'], ['house', 'Housekeeping – no slip or trip hazards'],
    ['chem', 'Chemical hazards identified (WHMIS labels, SDS available)'], ['bio', 'Biological / radiation hazards identified'],
    ['elec', 'Electrical hazards identified'], ['over', 'Overhead / ceiling access checked'],
    ['permit', 'Permits / lockout requirements confirmed'], ['park', 'Parking, loading and equipment access'],
  ];
  App.SITE_CHECKS = SITE_CHECKS;
  App.modules.site = {
    key: 'site', name: 'Site Inspection', plural: 'Site inspections', icon: 'site',
    blank() {
      return base('site', {
        date: today(), time: '', inspector: Settings.get().tech.name, customer: '', siteName: '', street: '', city: '', prov: 'AB', postal: '',
        contact: '', contactPhone: '', emergencyPhone: '', altContact: '', altPhone: '', gateDocs: '', jobPO: '', escort: '',
        checks: {}, hazards: '', actions: '', photos: [], sigInspector: '', siteRep: '', sigRep: '',
      });
    },
    item(r) { const no = SITE_CHECKS.filter(([k]) => r.checks && r.checks[k] === 'No').length; return { title: `${r.siteName || r.customer || 'Site'}`, sub: [fmtDate(r.date), r.city, r.jobPO].filter(Boolean).join(' · '), badge: badge(no ? no + ' issue' + (no > 1 ? 's' : '') : (r.status === 'final' ? 'Complete' : 'Draft'), no ? 'warn' : r.status === 'final' ? 'ok' : ''), date: r.date }; },
    fileName: (r) => `Site_${r.siteName || r.customer || 'inspection'}_${(r.date || '').replace(/-/g, '')}`,
    validate: (r) => (!r.siteName && !r.customer ? 'Add the customer or site name first' : ''),
    form(r) {
      return custList() +
        C.sec('who', 'Visit', `<div class="grid2">${C.date('Date', 'date', r)}${C.time('Time', 'time', r)}${C.text('Inspector', 'inspector', r)}${C.text('Customer', 'customer', r, { list: 'dl-cust' })}${C.text('Site / building name', 'siteName', r)}${C.text('Job name or PO number', 'jobPO', r)}</div>`) +
        C.sec('addr', 'Site address', `<div class="grid2">${C.text('Street address', 'street', r, { cls: 'span2' })}${C.text('City', 'city', r)}${C.text('Province / state', 'prov', r)}${C.text('Postal / zip', 'postal', r)}</div>`) +
        C.sec('access', 'Site access and contacts',
          `<div class="grid2">${C.text('Site contact', 'contact', r)}${C.text('Contact phone', 'contactPhone', r, { type: 'tel' })}${C.text('Site emergency number', 'emergencyPhone', r, { type: 'tel' })}${C.text('Escort name', 'escort', r)}${C.text('Alternate contact', 'altContact', r)}${C.text('Alternate phone', 'altPhone', r, { type: 'tel' })}</div>${C.area('Documents required at the gate', 'gateDocs', r, { rows: 2 })}`) +
        C.sec('checks', 'Site conditions checklist',
          SITE_CHECKS.map(([k, label]) => `<div class="vrow"><span>${esc(label)}</span>${C.seg('', 'checks.' + k, r, ['Yes', 'No', 'N/A'], { mini: true })}</div>`).join('')) +
        C.sec('notes', 'Hazards and actions', `${C.area('Hazards / issues noted', 'hazards', r)}${C.area('Actions required before work starts', 'actions', r)}`) +
        C.sec('photos', 'Photos', C.photos('Site photos', 'photos', r), { badge: (r.photos || []).length ? String(r.photos.length) : '' }) +
        C.sec('sign', 'Sign-off', `${C.sig('Inspector signature', 'sigInspector', r)}${C.text('Site representative', 'siteRep', r)}${C.sig('Site representative signature', 'sigRep', r)}`);
    },
    bar: () => '<button class="btn" data-act="preview">Preview / PDF</button><button class="btn primary" data-act="complete">Mark complete</button>',
  };

  /* ======================================================================
     TIME ENTRY  (feeds the Daily Work Log + invoices)
     ====================================================================== */
  App.modules.time = {
    key: 'time', name: 'Time Entry', plural: 'Time entries', icon: 'time', listHash: '#/time',
    blank(q) {
      return base('time', { status: 'final', date: (q && q.get('date')) || today(), customer: (q && q.get('customer')) || '', jobNo: '', quoteNo: '', clientRef: '', task: '', location: '', approvedBy: '', start: '', end: '', hours: '', completed: true, billable: true, notes: '' });
    },
    item(r) { return { title: `${num(r.hours)} h — ${r.task || 'Work'}`, sub: [r.customer, r.location, r.jobNo].filter(Boolean).join(' · '), badge: r.billedTo ? badge('Invoiced', 'ok') : (r.billable === false ? badge('Non-billable', '') : null), date: r.date }; },
    form(r) {
      return custList() +
        C.sec('t', 'Time',
          `<div class="grid2">${C.date('Date worked', 'date', r)}${C.text('Customer / "To"', 'customer', r, { list: 'dl-cust' })}${C.text('Task', 'task', r, { list: 'dl-task' })}${C.text('Work space / room / elevation', 'location', r)}` +
          `${C.time('Start (optional)', 'start', r)}${C.time('End (optional)', 'end', r)}${C.num('Hours', 'hours', r, { step: '0.25' })}${C.text('Approved by (GC / client)', 'approvedBy', r)}</div>` +
          `<p class="muted small">Enter start and end times and the hours fill in (rounded to ¼ hour), or just type the hours.</p>`) +
        C.sec('ref', 'Job references', `<div class="grid3">${C.text('Job number', 'jobNo', r)}${C.text('Quote number', 'quoteNo', r)}${C.text('Client reference', 'clientRef', r)}</div>${C.chk('Task completed', 'completed', r)}${C.chk('Billable', 'billable', r)}${C.area('Notes / deficiencies', 'notes', r, { rows: 2 })}`);
    },
    bar: () => '<button class="btn" data-act="entryDup">Duplicate</button><button class="btn primary" data-act="entryDone">Done</button>',
    onChange(r, path) {
      if ((path === 'start' || path === 'end') && r.start && r.end) {
        const [h1, m1] = r.start.split(':').map(Number), [h2, m2] = r.end.split(':').map(Number);
        let mins = (h2 * 60 + m2) - (h1 * 60 + m1); if (mins < 0) mins += 24 * 60;      // crossed midnight
        r.hours = String(Math.round(mins / 15) / 4);
        const el = $('[data-f="hours"]'); if (el) el.value = r.hours;
      }
    },
  };

  /* ======================================================================
     EXPENSE ENTRY
     ====================================================================== */
  App.modules.exp = {
    key: 'exp', name: 'Expense', plural: 'Expenses', icon: 'exp', listHash: '#/time?tab=exp',
    blank(q) {
      return base('exp', { status: 'final', date: (q && q.get('date')) || today(), customer: '', jobNo: '', category: '', desc: '', from: '', to: '', km: '', rate: String(Settings.get().rates.km), amount: '', tax: '', billable: true, receipt: [] });
    },
    item(r) { return { title: `${money(num(r.amount))} — ${r.category || 'Expense'}`, sub: [r.desc, r.customer, r.jobNo].filter(Boolean).join(' · '), badge: r.billedTo ? badge('Invoiced', 'ok') : (r.billable === false ? badge('Non-billable', '') : null), date: r.date }; },
    form(r) {
      const mileage = norm(r.category) === 'mileage';
      return custList() +
        C.sec('e', 'Expense',
          `<div class="grid2">${C.date('Date', 'date', r)}${C.text('Category', 'category', r, { list: 'dl-cat' })}${C.text('Customer', 'customer', r, { list: 'dl-cust' })}${C.text('Job / PO number', 'jobNo', r)}</div>` +
          `${C.text('Description', 'desc', r)}` +
          (mileage ? `<div class="grid3">${C.text('From', 'from', r)}${C.text('To', 'to', r)}${C.num('Kilometres', 'km', r)}</div><p class="muted small">Amount = km × ${esc(r.rate)} $/km (change the rate in Settings).</p>` : '') +
          `<div class="grid2">${C.num('Amount ($)', 'amount', r, { step: '0.01' })}${C.num('GST included ($, optional)', 'tax', r, { step: '0.01' })}</div>${C.chk('Billable to customer', 'billable', r)}`) +
        C.sec('rc', 'Receipt', C.photos('Receipt photo', 'receipt', r), { badge: (r.receipt || []).length ? String(r.receipt.length) : '' });
    },
    bar: () => '<button class="btn" data-act="entryDup">Duplicate</button><button class="btn primary" data-act="entryDone">Done</button>',
    onChange(r, path) {
      if (path === 'category') { App.renderForm(); return; }                        // show/hide the mileage fields
      if ((path === 'km') && norm(r.category) === 'mileage') {
        r.amount = String(round2(num(r.km) * num(r.rate)));
        const el = $('[data-f="amount"]'); if (el) el.value = r.amount;
        if (!r.desc) { r.desc = `Mileage ${r.km} km @ $${r.rate}/km`; const d = $('[data-f="desc"]'); if (d) d.value = r.desc; }
      }
    },
  };
  // shared actions for time/expense entries
  act.entryDone = async () => { await App.saveNow(); location.hash = Ctx.mod.listHash; };
  act.entryDup = async () => { const r = Ctx.rec, mod = Ctx.mod; await App.saveNow(); const n = JSON.parse(JSON.stringify(r)); n.id = uid(); n.created = nowIso(); delete n.billedTo; Ctx.pending[n.id] = n; location.hash = '#/edit/' + mod.key + '/' + n.id; };

  /* ======================================================================
     CUSTOMERS
     ====================================================================== */
  App.modules.cust = {
    key: 'cust', name: 'Customer', plural: 'Customers', icon: 'cust', listHash: '#/list/cust',
    blank() { return base('cust', { status: 'final', name: '', contact: '', phone: '', email: '', address: '', shipName: '', shipAddress: '', shipPhone: '', siteContact: '', notes: '', projectName: '', siteAddress: '', contractNo: '', clientProjNo: '', owner: '', clientRep: '', supervisor: '', workArea: '' }); },
    item(r) { return { title: r.name || 'New customer', sub: [r.contact, r.phone].filter(Boolean).join(' · '), date: r.name }; },
    form(r) {
      return C.sec('vs', 'Site visit defaults (pre-fill the PDF forms)', `<div class="grid2">${C.text('Project name', 'projectName', r)}${C.text('Work area / lab', 'workArea', r)}${C.text('Contract no.', 'contractNo', r)}${C.text('Client project no. / PO', 'clientProjNo', r)}${C.text('Owner', 'owner', r)}${C.text('Client rep', 'clientRep', r)}${C.text('Supervisor name / phone', 'supervisor', r)}</div>${C.area('Project / site address', 'siteAddress', r, { rows: 2 })}`) +
        C.sec('c', 'Bill to', `${C.text('Customer / company name', 'name', r)}<div class="grid2">${C.text('Accounts contact', 'contact', r)}${C.text('Phone', 'phone', r, { type: 'tel' })}${C.text('Email', 'email', r, { type: 'email' })}</div>${C.area('Billing address', 'address', r)}`) +
        C.sec('s', 'Ship to / site (optional)', `<div class="grid2">${C.text('Ship-to name', 'shipName', r)}${C.text('Ship-to phone', 'shipPhone', r, { type: 'tel' })}</div>${C.area('Ship-to address', 'shipAddress', r)}${C.text('Default site contact', 'siteContact', r)}${C.area('Notes', 'notes', r, { rows: 2 })}`);
    },
    bar: () => '<button class="btn primary" data-act="custDone">Done</button>',
  };
  act.custDone = async () => { await App.saveNow(); location.hash = '#/list/cust'; };

  /* ======================================================================
     INVOICE  (layout follows your DS Home Computing invoice)
     ====================================================================== */
  function invTotals(r) {
    const sub = round2((r.items || []).reduce((a, it) => a + num(it.qty) * num(it.price), 0));
    const tax = round2(sub * num(r.taxRate) / 100);
    return { sub, tax, total: round2(sub + tax) };
  }
  App.invTotals = invTotals;
  App.modules.inv = {
    key: 'inv', name: 'Invoice', plural: 'Invoices', icon: 'inv', listHash: '#/list/inv',
    blank() {
      const s = Settings.get();
      return base('inv', {
        number: String(s.inv.nextNo), date: today(), termsDays: String(s.inv.termsDays), due: addDays(today(), s.inv.termsDays || 0), poNumber: '', customerId: '',
        billTo: { name: '', contact: '', address: '', phone: '', email: '' }, shipTo: { name: '', address: '', phone: '' },
        items: [{ desc: '', sub: '', qty: '1', price: '' }], taxLabel: s.inv.taxLabel, taxRate: String(s.inv.taxRate), notes: s.inv.notes, paidDate: '', links: { fh: [], time: [], exp: [] },
      });
    },
    afterFirstSave(r) { if (num(r.number) >= Settings.get().inv.nextNo) Settings.set('inv.nextNo', Math.floor(num(r.number)) + 1); },
    item(r) { const t = invTotals(r); return { title: `Invoice ${r.number} — ${r.billTo.name || 'No customer'}`, sub: [fmtDate(r.date), money(t.total)].join(' · '), badge: badge(r.status === 'paid' ? 'Paid' : r.status === 'sent' ? 'Sent' : 'Draft', r.status === 'paid' ? 'ok' : r.status === 'sent' ? 'warn' : ''), date: r.date }; },
    fileName: (r) => `Invoice_${r.number}_${r.date}`,
    mailto(r) {
      const s = Settings.get(), t = invTotals(r);
      return 'mailto:' + encodeURIComponent(r.billTo.email || '') + '?subject=' + encodeURIComponent(`Invoice ${r.number} from ${s.company.name}`) +
        '&body=' + encodeURIComponent(`Hello ${r.billTo.contact || ''},\n\nPlease find invoice ${r.number} attached (${money(t.total)} CAD, due ${fmtDate(r.due)}).\n\nThank you,\n${s.company.name}`);
    },
    validate: (r) => (!r.billTo.name ? 'Add who the invoice is for' : (!(r.items || []).some((i) => i.desc) ? 'Add at least one line item' : '')),
    form(r) {
      const custs = Store.all('cust').sort(byName).map((c) => [c.id, c.name]);
      const t = invTotals(r);
      const lines = (r.items || []).map((it, i) =>
        `<div class="rowcard"><div class="head"><b>Line ${i + 1}</b><button type="button" class="link danger" data-act="invDel" data-i="${i}">Remove</button></div>` +
        `${C.text('Description', `items.${i}.desc`, r)}${C.text('Details (optional)', `items.${i}.sub`, r)}` +
        `<div class="grid3">${C.num('Qty', `items.${i}.qty`, r)}${C.num('Unit price', `items.${i}.price`, r, { step: '0.01' })}<div class="fld"><span>Amount</span><div class="amt" id="amt-${i}" style="padding-top:.7rem;font-weight:600">${money(num(it.qty) * num(it.price))}</div></div></div></div>`).join('');
      return C.sec('who', 'Customer',
          `${C.sel('Choose saved customer', 'customerId', r, custs)}<p class="small"><a href="#/new/cust">+ New customer</a></p>` +
          `${C.text('Bill to — name', 'billTo.name', r)}<div class="grid2">${C.text('Contact', 'billTo.contact', r)}${C.text('Phone', 'billTo.phone', r, { type: 'tel' })}${C.text('Email', 'billTo.email', r, { type: 'email' })}</div>${C.area('Billing address', 'billTo.address', r, { rows: 3 })}` +
          `${C.text('Ship to — name (optional)', 'shipTo.name', r)}${C.area('Ship-to address', 'shipTo.address', r, { rows: 2 })}`) +
        C.sec('meta', 'Invoice details', `<div class="grid2">${C.text('Invoice number', 'number', r)}${C.date('Invoice date', 'date', r)}${C.num('Terms (days)', 'termsDays', r, { step: '1' })}${C.date('Payment due', 'due', r)}${C.text('Customer PO / reference', 'poNumber', r)}</div>`) +
        C.sec('items', 'Line items', `${lines}<div class="row"><button type="button" class="btn grow" data-act="invAdd">+ Add line</button><button type="button" class="btn primary grow" data-act="invPick">Add unbilled work</button></div>` +
          `<div class="grid2" style="margin-top:.7rem">${C.text('Tax label', 'taxLabel', r)}${C.num('Tax rate (%)', 'taxRate', r, { step: '0.01' })}</div>` +
          `<div id="inv-tot" class="stats"><span class="stat">Subtotal <b>${money(t.sub)}</b></span><span class="stat">${esc(r.taxLabel)} <b>${money(t.tax)}</b></span><span class="stat">Total <b>${money(t.total)}</b></span></div>`, { badge: money(t.total) }) +
        C.sec('notes', 'Notes and status', `${C.area('Notes / terms', 'notes', r, { rows: 3 })}${C.seg('Status', 'status', r, [['draft', 'Draft'], ['sent', 'Sent'], ['paid', 'Paid']])}${C.date('Date paid', 'paidDate', r)}<p class="muted small">Payment instructions (bank details) are set once in Settings and print on every invoice.</p>`);
    },
    bar: () => '<button class="btn" data-act="preview">Preview / PDF</button><button class="btn primary" data-act="invSent">Mark sent</button>',
    onChange(r, path) {
      if (path === 'customerId') {
        const c = Store.get(r.customerId);
        if (c) { r.billTo = { name: c.name, contact: c.contact, address: c.address, phone: c.phone, email: c.email }; r.shipTo = { name: c.shipName, address: c.shipAddress, phone: c.shipPhone }; App.renderForm(); }
        return;
      }
      if (path === 'date' || path === 'termsDays') { r.due = addDays(r.date || today(), Math.floor(num(r.termsDays))); const el = $('[data-f="due"]'); if (el) el.value = r.due; }
      if (/^items\.\d+\.(qty|price)$/.test(path) || path === 'taxRate' || path === 'taxLabel') {
        (r.items || []).forEach((it, i) => { const el = $('#amt-' + i); if (el) el.textContent = money(num(it.qty) * num(it.price)); });
        const t = invTotals(r), box = $('#inv-tot');
        if (box) box.innerHTML = `<span class="stat">Subtotal <b>${money(t.sub)}</b></span><span class="stat">${esc(r.taxLabel)} <b>${money(t.tax)}</b></span><span class="stat">Total <b>${money(t.total)}</b></span>`;
      }
    },
    // Deleting an invoice releases the work that was billed on it
    async onDelete(r) {
      for (const type of ['fh', 'time', 'exp']) for (const x of Store.all(type)) if (x.billedTo === r.id) { delete x.billedTo; await Store.save(x); }
    },
  };
  act.invAdd = () => { Ctx.rec.items.push({ desc: '', sub: '', qty: '1', price: '' }); App.changed('items'); App.renderForm(); };
  act.invDel = (el) => { Ctx.rec.items.splice(+el.dataset.i, 1); App.changed('items'); App.renderForm(); };
  act.invSent = async () => {
    const r = Ctx.rec, msg = Ctx.mod.validate(r); if (msg) { toast(msg); return; }
    if (r.status === 'draft' || !r.status) r.status = 'sent';
    await App.saveNow(); location.hash = '#/view/inv/' + r.id;
  };

  // Pull unbilled inspections, hours and expenses onto the invoice
  act.invPick = () => {
    const r = Ctx.rec, nm = norm(r.billTo.name);
    const fhs = Store.all('fh').filter((x) => x.status === 'final' && !x.billedTo);
    const times = Store.all('time').filter((x) => x.billable !== false && !x.billedTo);
    const exps = Store.all('exp').filter((x) => x.billable !== false && !x.billedTo);
    if (!fhs.length && !times.length && !exps.length) { toast('Nothing unbilled right now'); return; }
    const match = (x) => !nm || norm(x.customer) === nm || norm(x.customer).includes(nm) || nm.includes(norm(x.customer)) && norm(x.customer);
    const row = (kind, x, label, sub) => `<label class="chk"><input type="checkbox" data-pk="${kind}:${x.id}"${match(x) ? ' checked' : ''}><span><b>${esc(label)}</b><br><small class="muted">${esc(sub)}</small></span></label>`;
    const s = modal(`<h3>Add unbilled work</h3><p class="muted small">Ticked items match “${esc(r.billTo.name || 'any customer')}”. Untick anything you do not want on this invoice.</p>` +
      (fhs.length ? '<h4>Fume hood inspections</h4>' + fhs.map((x) => row('fh', x, `${x.fhId} — ${x.customer}`, fmtDate(x.completed || x.issued))).join('') : '') +
      (times.length ? '<h4>Time</h4>' + times.map((x) => row('time', x, `${num(x.hours)} h — ${x.task || 'Work'}`, [fmtDate(x.date), x.customer].filter(Boolean).join(' · '))).join('') : '') +
      (exps.length ? '<h4>Expenses</h4>' + exps.map((x) => row('exp', x, `${money(num(x.amount))} — ${x.category || 'Expense'}`, [fmtDate(x.date), x.customer].filter(Boolean).join(' · '))).join('') : '') +
      '<div class="row end" style="margin-top:.8rem"><button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Add to invoice</button></div>', { sticky: true });
    s.onclick = async (e) => {
      const b = e.target.closest('[data-x]'); if (!b) return;
      if (b.dataset.x === 'no') { closeModal(); return; }
      const picked = $$('input[data-pk]:checked', s).map((i) => i.dataset.pk.split(':'));
      closeModal(); if (!picked.length) return;
      const set = Settings.get(); const link = (kind) => picked.filter((p) => p[0] === kind).map((p) => Store.get(p[1])).filter(Boolean);
      const f = link('fh'), t = link('time'), x = link('exp');
      // drop the empty placeholder line if that is all there is
      if (r.items.length === 1 && !r.items[0].desc && !r.items[0].price) r.items = [];
      if (f.length) r.items.push({ desc: 'Fume Hood Inspections', sub: f.map((h) => h.fhId).join(', '), qty: String(f.length), price: String(set.inv.fhPrice) });
      if (t.length) r.items.push({ desc: 'Labour', sub: [...new Set(t.map((h) => h.task).filter(Boolean))].join(', '), qty: String(round2(t.reduce((a, h) => a + num(h.hours), 0))), price: set.inv.hourly ? String(set.inv.hourly) : '' });
      x.forEach((e2) => r.items.push({ desc: e2.category || 'Expense', sub: e2.desc || '', qty: '1', price: String(num(e2.amount)) }));
      for (const rec of [...f, ...t, ...x]) { rec.billedTo = r.id; await Store.save(rec); }
      r.links = r.links || { fh: [], time: [], exp: [] };
      f.forEach((h) => r.links.fh.push(h.id)); t.forEach((h) => r.links.time.push(h.id)); x.forEach((h) => r.links.exp.push(h.id));
      App.changed('items'); App.renderForm();
      if (t.length && !set.inv.hourly) toast('Set your hourly rate on the Labour line (or in Settings)');
    };
  };

  /* ---------------- generic actions used by several forms ---------------- */
  act.preview = async () => { await App.saveNow(); location.hash = '#/view/' + Ctx.mod.key + '/' + Ctx.rec.id; };
  act.complete = async () => {
    const r = Ctx.rec, mod = Ctx.mod, msg = mod.validate ? mod.validate(r) : ''; if (msg) { toast(msg); return; }
    r.status = 'final'; await App.saveNow(); location.hash = '#/view/' + mod.key + '/' + r.id;
  };
})();
