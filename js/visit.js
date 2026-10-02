/* ==========================================================================
   visit.js — "Site visit": ONE mobile-friendly form that captures everything
   needed for the whole PDF package of a day on site:
     C.052 360 checklist · C.051 journey management · C.002 vehicle inspection
     C.001 field level hazard assessment (FLHA) · C.024 worksite inspection
     C.004 daily report · C.008 mileage cover sheet · the fume hood inspections.
   Fields that repeat across forms (project, address, contract no., vehicle,
   tech, date…) are typed once; customer and vehicle details are remembered.
   ========================================================================== */
(function () {
  'use strict';
  const App = window.App;
  const { $, esc, uid, nowIso, norm, num, round2, today, fmtDate, getPath, toast, C, Store, Settings, Ctx, act } = App;
  const M = App.modules;

  /* ---------------------------------------------------------- checklist data */
  // C.052 — 360 walk-around
  const D360 = ['Area in front of vehicle clear', 'Driver side clear', 'Rear area and backing path clear', 'Passenger side clear',
    'Under/near vehicle checked for leaks, objects, people, animals, cords, or tools', 'Tires/wheels appear safe',
    'Lights, mirrors, windows, and licence plate visible and usable', 'Load, tools, ladder, trailer, doors, tailgate, and caps secured',
    'Overhead hazards checked', 'Spotter briefed where required', 'Hazards removed or supervisor contacted before movement'];
  // C.002 — vehicle inspection (Good / Needs Repair / N/A)
  const VINSP = [
    ['safety', 'Safety equipment', ['First Aid Kit', 'Fire Extinguisher', 'Seat Belt', 'Emergency Roadside Kit', 'Buggy Whip / Amber Light']],
    ['fluids', 'Fluid levels', ['Fuel', 'Oil', 'Window Wash', 'Coolant']],
    ['docs', 'Documents', ['Insurance', 'Registration', 'Trailer Registration', 'Accident Report Book']],
    ['clean', 'Cleanliness', ['Cabin clear of debris and garbage', 'Box clear of debris and garbage', 'Overall condition of truck presents a professional image to client']],
  ];
  // C.001 — hazards to consider
  const HAZ = [
    ['phys', 'Physical', ['Housekeeping', 'Material storage & handling', 'Slip/Trip/Fall potential', 'Blocked exits & walkways', 'Confined/restricted space', 'Improper ventilation',
      'Powerlines overhead/underground', 'Ground/surface condition', 'Open excavation', 'Lighting', 'Weather', 'Hot work', 'Vehicle/pedestrian traffic',
      'Working at heights', 'Scaffolding', 'Falling objects', 'Loads moving or being hoisted', 'Ladder use', 'Critical lift', 'Others working below/overhead', 'Incorrect tools/equipment',
      'Working on/near energized equipment', 'Defective tools/equipment', 'Unguarded equipment', 'Noise', 'Vibration']],
    ['ergo', 'Ergonomic', ['Awkward body positioning', 'Overextension', 'Repetitive motion', 'Twisting/reaching/bending', 'Cramped/tight work area', 'Forceful pushing/pulling', 'Awkward grip/load carried', 'Working at overhead height']],
    ['chem', 'Chemical', ['Freeze burn', 'Chemical handling/storage', 'Spill potential', 'Dust/fumes/vapours/gases', 'Fire/explosion/reactive properties', 'Acid/corrosive material', 'Aerosols']],
    ['bio', 'Biological', ['Waste disposal', 'Blood/bodily fluid', 'Virus/bacteria', 'Insect bite', 'Lack of hygiene/sanitation']],
    ['psy', 'Psychosocial', ['Personal limitations/illness, age, mental stability', 'Harassment/violence', 'Stress/fatigue', 'Working alone', 'Worker(s) not competent']],
  ];
  // Typical fume hood visit — one tap pre-ticks these (editable afterwards)
  const HAZ_PRESET = ['Slip/Trip/Fall potential', 'Ladder use', 'Defective tools/equipment', 'Others working below/overhead', 'Awkward body positioning', 'Twisting/reaching/bending',
    'Chemical handling/storage', 'Spill potential', 'Dust/fumes/vapours/gases', 'Vehicle/pedestrian traffic'];
  const FLHA_Q = ['Working alone?', 'Was the work area cleaned up/materials stored and disposed of properly?', 'Permits required for work?', 'Are your permits closed?',
    'Lock outs removed from energized panels?', 'Did you properly lock out & tag any defective tools/equipment?', 'Did you notify nearby workers of any hazards that may affect them?', 'Work affected by weather?'];
  const JSA_TITLES = ['Administrative', 'Housekeeping', 'Computer repair', 'Hand tools'];
  // C.024 — worksite inspection
  const WS = ['Hard hats in use', 'Safety footwear worn', 'Hearing protection worn', 'Safety vests worn', 'COVID-19 PPE in use', 'Other PPE used (when required)', 'First aid kit available and accessible',
    'Fire extinguisher accessible', 'Emergency phone number and job location posted or made aware of', 'Back up alarms working', 'Revolving lights working', 'Equipment checked daily',
    'General housekeeping to standard', 'Field offices clean', 'Workers aware of overhead lines', 'Underground lines marked', 'Proper trench slopes used', 'Shoring used when required',
    'Security measures used for deep trench', 'Ladders used in condition', 'Roads well signed and barricaded', 'Traffic pattern safe and efficient', 'Security measures taken at end of day',
    'Hazard assessments discussed regularly', 'Toolbox meetings held', 'Incident or near misses reported'];
  // C.051 — journey management hazard/control rows
  const JM = [['weather', 'Weather / road conditions checked', ['Checked – OK', 'Checked – caution']], ['fatigue', 'Fatigue risk reviewed', ['Rested – fit to drive', 'Reviewed']],
    ['veh', 'Vehicle inspection and 360 completed', ['Yes – both completed']], ['load', 'Load / trailer controls', ['Tools and instruments secured', 'N/A']],
    ['comm', 'Communication method', ['Cell phone']], ['checkin', 'Check-in person and schedule', []], ['overdue', 'Overdue escalation time and contact', []], ['emerg', 'Emergency contacts / roadside assistance', []]];
  Object.assign(App, { D360, VINSP, HAZ, FLHA_Q, JSA_TITLES, WS, JM });

  /* ------------------------------------------------------------ helpers */
  const arr = (n) => Array(n).fill('');
  const hoods = (v) => Store.all('fh').filter((h) => h.visitId === v.id).sort((a, b) => String(a.created).localeCompare(String(b.created)));
  const legKm = (l) => (l.odoStart !== '' && l.odoEnd !== '' && isFinite(parseFloat(l.odoEnd) - parseFloat(l.odoStart))) ? Math.max(0, round2(parseFloat(l.odoEnd) - parseFloat(l.odoStart))) : num(l.km);
  const totalKm = (v) => round2((v.legs || []).reduce((a, l) => a + legKm(l), 0));
  Object.assign(App, { visitHoods: hoods, legKm, totalKm });
  const custByName = (n) => Store.all('cust').find((c) => norm(c.name) === norm(n));
  const custList = () => `<datalist id="dl-cust">${Store.all('cust').sort((a, b) => norm(a.name).localeCompare(norm(b.name))).map((c) => `<option value="${esc(c.name)}">`).join('')}</datalist>`;

  // build "Completed activity" text for the daily report from the hoods inspected
  function dailyText(v) {
    const hs = hoods(v);
    if (!hs.length) return v.task ? v.task : '';
    const lines = hs.map((h) => { const st = App.fhStats(h); return `Fume hood ${h.fhId || '?'}${h.lab ? ' (' + h.lab + ')' : ''} inspected${st.n ? ' – average ' + Math.round(st.avg) + ' fpm' : ''}${h.deficiencies ? '; deficiencies noted' : ''}`; });
    return `Annual fume hood inspections – ${hs.length} hood${hs.length === 1 ? '' : 's'} completed.\n` + lines.join('\n');
  }
  App.visitDailyText = dailyText;

  // progress badge for a section: "3/11"
  const prog = (vals) => { const done = vals.filter((x) => x !== '' && x != null).length; return done ? `${done}/${vals.length}` : ''; };
  const flat = (o) => Object.keys(o || {}).reduce((a, k) => a.concat(o[k]), []);

  /* ------------------------------------------------------------ the module */
  M.visit = {
    key: 'visit', name: 'Site visit', plural: 'Site visits', icon: 'site',
    blank() {
      const s = Settings.get(), v = s.vehicle || {};
      const vinsp = {}; VINSP.forEach(([k, , l]) => { vinsp[k] = arr(l.length); });
      return {
        id: uid(), type: 'visit', created: nowIso(), status: 'draft',
        date: today(), customer: '', projectName: '', address: '', contractNo: '', clientProjNo: '', owner: '', clientRep: '', supervisor: '', workArea: '', task: 'Fume hood inspection', tech: s.tech.name,
        vehicle: { desc: v.desc || '', plate: v.plate || '', ownership: v.ownership || '' },
        legs: [{ time: '', from: s.tripFrom || '', to: '', odoStart: '', odoEnd: '', km: '' }], purpose: '',
        d360: { items: arr(D360.length), time: '', observer: '', issue: '', notes: '' },
        vinsp, vnotes: '',
        jm: { passengers: '', route: '', depart: '', eta: '', stops: '', alt: '', fields: {}, approval: '', departed: '', ci1: '', ci2: '', arrived: '' },
        flha: { haz: {}, taskDesc: '', topic: '', jsaReviewed: '', firstAid: '', fireExt: '', muster: '', emergNo: '', q: arr(FLHA_Q.length), weather: '', nearMiss: '', ppe: { foot: '', footSize: '', eye: '', eyeShield: false, gloves: '', glovesRating: '', hat: '', resp: '', respType: '', cov: '', other: '' },
          jsa: JSA_TITLES.map((t) => ({ title: t, notes: '', aware: '' })), steps: [], crew: [{ name: '', trade: '', time_in: '', time_out: '', ppe: '', sig: '' }], supervisorSig: '' },
        ws: { items: arr(WS.length), comments: '' },
        daily: { completed: '', planned: '', auto: true },
        sigTech: '', sigClientRep: '', useSaved: true, finalized: false,
      };
    },
    item(v) {
      const n = hoods(v).length;
      return { title: `${v.customer || 'New visit'}${v.projectName ? ' — ' + v.projectName : ''}`, sub: [fmtDate(v.date), n ? n + ' hood' + (n > 1 ? 's' : '') : 'no hoods yet', totalKm(v) ? totalKm(v) + ' km' : ''].filter(Boolean).join(' · '),
        badge: { text: v.pdfAt ? 'PDFs made' : 'Draft', cls: v.pdfAt ? 'ok' : '' }, date: v.date };
    },
    collapsed: ['trip', 'd360', 'vinsp', 'jm', 'flha', 'ws', 'hoods', 'wrap'],
    validate: (v) => (!v.customer ? 'Add the customer first' : ''),
    onDelete: async (v) => { for (const h of hoods(v)) { delete h.visitId; await Store.save(h); } },
    backHash: () => '#/list/visit',

    form(v) {
      const O = (sel, path, opts) => C.seg(sel, path, v, opts);
      const s = Settings.get();

      /* 1 — Visit & site ------------------------------------------------ */
      const secVisit = C.sec('visit', '1 · Visit and site',
        `<div class="grid2">${C.date('Date', 'date', v)}${C.text('Customer', 'customer', v, { list: 'dl-cust' })}${C.text('Project name', 'projectName', v)}${C.text('Work area / lab', 'workArea', v)}` +
        `${C.text('Contract no.', 'contractNo', v)}${C.text('Client project no. / PO', 'clientProjNo', v)}${C.text('Owner', 'owner', v)}${C.text('Client rep', 'clientRep', v)}` +
        `${C.text('Supervisor name / phone', 'supervisor', v)}${C.text('Task', 'task', v, { list: 'dl-task' })}${C.text('Technician (you)', 'tech', v)}</div>${C.area('Project / site address', 'address', v, { rows: 2 })}` +
        `<p class="muted small">Pick a saved customer and the site details fill in. Whatever you type is saved back to that customer for next time.</p>`);

      /* 2 — Vehicle & trip ---------------------------------------------- */
      const legs = v.legs.map((l, i) => `<div class="leg"><b class="small">Leg ${i + 1}</b>${v.legs.length > 1 ? `<button type="button" class="link" data-act="legDel" data-i="${i}">Remove</button>` : ''}` +
        `<div class="grid2">${C.time('Time', `legs.${i}.time`, v)}${C.text('From', `legs.${i}.from`, v)}${C.text('To', `legs.${i}.to`, v)}` +
        `${C.text('Odometer start', `legs.${i}.odoStart`, v, { mode: 'numeric' })}${C.text('Odometer finish', `legs.${i}.odoEnd`, v, { mode: 'numeric' })}<div class="fld"><span>Kilometres</span><div class="kmout" id="km-${i}">${legKm(l) || '–'}</div></div></div></div>`).join('');
      const secTrip = C.sec('trip', '2 · Vehicle and trip',
        `<div class="grid2">${C.text('Vehicle make / model / year', 'vehicle.desc', v)}${C.text('Licence plate', 'vehicle.plate', v)}</div>${O('Ownership', 'vehicle.ownership', ['Owned', 'Rented'])}` +
        `${C.text('Purpose of trip', 'purpose', v, { ph: 'Fume hood inspections at ' + (v.customer || 'customer') })}${legs}` +
        `<div class="row"><button type="button" class="btn sm" data-act="legAdd">+ Add another leg (e.g. return trip)</button></div><div class="stats"><span class="stat">Total <b id="km-total">${totalKm(v)}</b> km</span><span class="stat">Mileage <b id="km-amt">$${(totalKm(v) * s.rates.km).toFixed(2)}</b></span></div>`,
        { badge: totalKm(v) ? totalKm(v) + ' km' : '' });

      /* 3 — 360 walk-around (C.052) ------------------------------------- */
      const sec360 = C.sec('d360', '3 · 360 walk-around (C.052)',
        `<div class="row end"><button type="button" class="link" data-act="allOk" data-p="d360.items" data-n="${D360.length}" data-v="OK">Mark all OK</button></div>` +
        D360.map((l, i) => `<div class="vrow"><span>${esc(l)}</span>${C.seg('', `d360.items.${i}`, v, ['OK', 'Issue', 'N/A'], { mini: true })}</div>`).join('') +
        `<div class="grid2">${C.time('Time', 'd360.time', v)}${C.text('Observer / supervisor (if any)', 'd360.observer', v)}</div>${C.area('Issue found / corrective action', 'd360.issue', v, { rows: 2 })}`,
        { badge: prog(v.d360.items) });

      /* 4 — Vehicle inspection (C.002) ----------------------------------- */
      const secVeh = C.sec('vinsp', '4 · Vehicle inspection (C.002)',
        VINSP.map(([k, title, list]) => `<div class="row end"><b class="small grow">${esc(title)}</b><button type="button" class="link" data-act="allOk" data-p="vinsp.${k}" data-n="${list.length}" data-v="Good">All good</button></div>` +
          list.map((l, i) => `<div class="vrow"><span>${esc(l)}</span>${C.seg('', `vinsp.${k}.${i}`, v, [['Good', 'Good'], ['Needs Repair', 'Repair'], ['N/A', 'N/A']], { mini: true })}</div>`).join('')).join('') +
        C.area('Notes / deficiencies', 'vnotes', v, { rows: 2 }), { badge: prog(flat(v.vinsp)) });

      /* 5 — Journey management (C.051) ----------------------------------- */
      const secJM = C.sec('jm', '5 · Journey management (C.051)',
        `${C.text('Passengers', 'jm.passengers', v, { ph: 'None' })}${C.text('Planned route', 'jm.route', v)}<div class="grid2">${C.time('Departure', 'jm.depart', v)}${C.time('Estimated arrival', 'jm.eta', v)}</div>` +
        `${C.text('Fuel / charging / rest stops', 'jm.stops', v)}${C.text('Alternate route or stop plan', 'jm.alt', v)}` +
        JM.map(([k, label, chips]) => (chips.length ? C.quick(label, 'jm.fields.' + k, v, chips) : C.text(label, 'jm.fields.' + k, v))).join('') +
        `<h4 class="subh">Approval and close-out</h4>${C.text('Supervisor approval before departure (name / time)', 'jm.approval', v)}<div class="grid2">${C.time('Departed', 'jm.departed', v)}${C.time('Check-in 1', 'jm.ci1', v)}${C.time('Check-in 2', 'jm.ci2', v)}${C.time('Safe arrival / closed', 'jm.arrived', v)}</div>`,
        { badge: prog([v.jm.route, v.jm.depart, v.jm.arrived]) });

      /* 6 — FLHA (C.001) ------------------------------------------------- */
      const hazHtml = HAZ.map(([k, title, list]) => `<h4 class="subh">${esc(title)}</h4><div class="chkgrid">${list.map((l) => C.chk(l, 'flha.haz.' + hk(l), v)).join('')}</div>`).join('');
      const secFlha = C.sec('flha', '6 · Field level hazard assessment (C.001)',
        `${C.area('Task(s) being performed', 'flha.taskDesc', v, { rows: 2, ph: 'Annual fume hood inspection: face velocity, sash, cables, alarm, liner' })}${C.text('Tool box safety topic', 'flha.topic', v)}${C.area('Job safety analyses reviewed (one per line)', 'flha.jsaReviewed', v, { rows: 2 })}${C.addChips('flha.jsaReviewed', JSA_TITLES)}` +
        `<h4 class="subh">Hazards to consider</h4><div class="row"><button type="button" class="btn sm" data-act="hazPreset">Tick typical fume hood hazards</button></div>${hazHtml}` +
        `<h4 class="subh">Emergency response</h4><div class="grid2">${C.text('First aid kit location', 'flha.firstAid', v)}${C.text('Fire extinguisher location', 'flha.fireExt', v)}${C.text('Muster point', 'flha.muster', v)}${C.text('Emergency number / radio channel', 'flha.emergNo', v)}</div>` +
        `<h4 class="subh">Inspection points</h4>${FLHA_Q.map((l, i) => `<div class="vrow"><span>${esc(l)}</span>${C.seg('', `flha.q.${i}`, v, ['Yes', 'No', 'N/A'], { mini: true })}</div>`).join('')}` +
        `${C.text('Weather description, temperature °C', 'flha.weather', v)}${C.text('Near misses for the day', 'flha.nearMiss', v)}` +
        `<h4 class="subh">PPE required</h4>${ppeHtml(v)}` +
        `<h4 class="subh">Hazard identification (work plan)</h4>${stepsHtml(v)}<div class="row"><button type="button" class="btn sm" data-act="stepAdd">+ Add task row</button><button type="button" class="btn sm" data-act="stepsFill">Fill from fume hood template</button></div>` +
        `<h4 class="subh">Worker sign-off</h4>${crewHtml(v)}<div class="row"><button type="button" class="btn sm" data-act="crewAdd">+ Add worker</button></div>`,
        { badge: Object.values(v.flha.haz).filter(Boolean).length ? Object.values(v.flha.haz).filter(Boolean).length + ' hazards' : '' });

      /* 7 — Worksite inspection (C.024) ---------------------------------- */
      const secWs = C.sec('ws', '7 · Worksite inspection (C.024)',
        `<div class="row end"><button type="button" class="link" data-act="allOk" data-p="ws.items" data-n="${WS.length}" data-v="Yes">All Yes</button></div>` +
        WS.map((l, i) => `<div class="vrow"><span>${esc(l)}</span>${C.seg('', `ws.items.${i}`, v, ['Yes', 'No', 'N/A'], { mini: true })}</div>`).join('') + C.area('Comments / corrective actions', 'ws.comments', v, { rows: 3 }),
        { badge: prog(v.ws.items) });

      /* 8 — Fume hoods -------------------------------------------------- */
      const hs = hoods(v);
      const secHoods = C.sec('hoods', '8 · Fume hood inspections',
        (hs.length ? hs.map((h) => { const it = M.fh.item(h); return `<div class="item"><a class="main" href="#/edit/fh/${h.id}"><b>${esc(it.title)}</b><small>${esc(it.sub)}</small></a><span class="pill ${it.badge.cls}">${esc(it.badge.text)}</span></div>`; }).join('') : '<p class="muted">No fume hoods yet. Add each hood as you inspect it — the customer, lab and technician carry over.</p>') +
        `<div class="row"><a class="btn primary" href="#/new/fh?visit=${v.id}">+ Add fume hood</a></div>`, { badge: hs.length ? String(hs.length) : '' });

      /* 9 — Wrap-up: daily report + mileage + signatures ----------------- */
      const secWrap = C.sec('wrap', '9 · Daily report, mileage and sign-off',
        `${C.area('Completed activity (C.004)', 'daily.completed', v, { rows: 4 })}<div class="row"><button type="button" class="btn sm" data-act="dailyRebuild">Rebuild from fume hoods</button></div>` +
        `${C.area('Planned for next week', 'daily.planned', v, { rows: 2 })}` +
        `<p class="muted small">Mileage cover sheet (C.008) is built from your trip legs: ${totalKm(v)} km × $${s.rates.km}/km.</p>` +
        `${C.sig('Your signature (used on every form)', 'sigTech', v)}${C.chk('Also use my saved signature from Settings when this one is blank', 'useSaved', v)}${C.sig('Client / supervisor signature (daily report, optional)', 'sigClientRep', v)}`);

      return custList() + `<div class="hint ok vhint">One form per site visit. Open each section, tap through it, then use <b>Make PDFs</b> at the bottom.</div>` +
        secVisit + secTrip + sec360 + secVeh + secJM + secFlha + secWs + secHoods + secWrap;
    },
    bar: () => '<button class="btn" data-act="hoodAdd">+ Hood</button><button class="btn primary" data-act="makePack">Make PDFs</button>',

    onChange(v, path) {
      // customer chosen → pull saved site details into empty fields
      if (path === 'customer') {
        const c = custByName(v.customer);
        if (c) {
          const map = { projectName: c.projectName, address: c.siteAddress || c.shipAddress || c.address, contractNo: c.contractNo, clientProjNo: c.clientProjNo, owner: c.owner, clientRep: c.clientRep, supervisor: c.supervisor, workArea: c.workArea };
          let filled = false;
          Object.keys(map).forEach((k) => { if (!v[k] && map[k]) { v[k] = map[k]; filled = true; } });
          if (filled) App.renderForm();
        }
      }
      if (path.indexOf('legs.') === 0) {
        v.legs.forEach((l, i) => { const el = $('#km-' + i); if (el) el.textContent = legKm(l) || '–'; });
        const t = $('#km-total'); if (t) t.textContent = totalKm(v); const a = $('#km-amt'); if (a) a.textContent = '$' + (totalKm(v) * Settings.get().rates.km).toFixed(2);
      }
    },
  };

  /* --------------------------------------------------- sub-form fragments */
  // checkbox keys must be safe for the dot-path engine
  const hk = (l) => l.replace(/[^a-z0-9]+/gi, '_').toLowerCase();
  App.hk = hk;
  function ppeHtml(v) {
    const P = 'flha.ppe.';
    return `<div class="vrow"><span>Footwear</span>${C.seg('', P + 'foot', v, ['Yes', 'No', 'N/A'], { mini: true })}</div>${C.seg('', P + 'footSize', v, ['6"', '8"', 'Steel toed'], { mini: true })}` +
      `<div class="vrow"><span>Eyewear</span>${C.seg('', P + 'eye', v, ['Yes', 'No', 'N/A'], { mini: true })}</div>${C.chk('Face shield', P + 'eyeShield', v)}` +
      `<div class="vrow"><span>Gloves</span>${C.seg('', P + 'gloves', v, ['Yes', 'No', 'N/A'], { mini: true })}</div>${C.text('Glove rating', P + 'glovesRating', v)}` +
      `<div class="vrow"><span>Hard hat</span>${C.seg('', P + 'hat', v, ['Yes', 'No', 'N/A'], { mini: true })}</div>` +
      `<div class="vrow"><span>Respiratory</span>${C.seg('', P + 'resp', v, ['N/A', '½ Mask', 'Full Mask'], { mini: true })}</div>${C.text('Filter', P + 'respType', v)}` +
      `<div class="vrow"><span>Coveralls / vest</span>${C.seg('', P + 'cov', v, ['Coveralls', 'Vest', 'No', 'N/A'], { mini: true })}</div>${C.text('Other PPE (list)', P + 'other', v)}`;
  }
  function stepsHtml(v) {
    if (!v.flha.steps.length) return '<p class="muted small">No task rows yet — tap “Fill from fume hood template” or add your own.</p>';
    return v.flha.steps.map((s, i) => `<div class="leg"><div class="row"><b class="small grow">Task ${i + 1}</b><button type="button" class="link" data-act="stepDel" data-i="${i}">Remove</button></div>` +
      `${C.area('Work plan task / action item', `flha.steps.${i}.step`, v, { rows: 2 })}${C.area('Hazard (actual or potential)', `flha.steps.${i}.hazard`, v, { rows: 2 })}` +
      `${C.seg('Risk ranking', `flha.steps.${i}.risk`, v, ['Low', 'Medium', 'High'])}${C.area('Controls (engineering, administrative, PPE)', `flha.steps.${i}.control`, v, { rows: 2 })}${C.seg('Task complete', `flha.steps.${i}.done`, v, ['Yes', 'No', 'N/A'])}</div>`).join('');
  }
  function crewHtml(v) {
    return v.flha.crew.map((c, i) => `<div class="leg"><div class="row"><b class="small grow">Worker ${i + 1}</b>${v.flha.crew.length > 1 ? `<button type="button" class="link" data-act="crewDelV" data-i="${i}">Remove</button>` : ''}</div>` +
      `<div class="grid2">${C.text('Name', `flha.crew.${i}.name`, v)}${C.text('Trade / company', `flha.crew.${i}.trade`, v)}${C.time('Time in', `flha.crew.${i}.time_in`, v)}${C.time('Time out', `flha.crew.${i}.time_out`, v)}${C.text('PPE inspected (initials)', `flha.crew.${i}.ppe`, v)}</div>${C.sig('Signature', `flha.crew.${i}.sig`, v)}</div>`).join('') +
      `${C.sig('Supervisor signature (optional)', 'flha.supervisorSig', v)}`;
  }

  /* ------------------------------------------------------------- actions */
  const redo = (p) => { App.changed(p); App.renderForm(); };
  act.allOk = (el) => { const base = el.dataset.p, n = +el.dataset.n; for (let i = 0; i < n; i++) { const p = `${base}.${i}`; if (!getPath(Ctx.rec, p)) App.setPath(Ctx.rec, p, el.dataset.v); } redo(base); };
  act.legAdd = () => { const v = Ctx.rec, last = v.legs[v.legs.length - 1]; v.legs.push({ time: '', from: last.to, to: last.from, odoStart: last.odoEnd, odoEnd: '', km: '' }); redo('legs'); };
  act.legDel = (el) => { Ctx.rec.legs.splice(+el.dataset.i, 1); redo('legs'); };
  act.hazPreset = () => { HAZ_PRESET.forEach((l) => { Ctx.rec.flha.haz[hk(l)] = true; }); toast('Typical hazards ticked — adjust as needed'); redo('flha.haz'); };
  act.stepAdd = () => { Ctx.rec.flha.steps.push({ step: '', hazard: '', risk: '', control: '', done: '' }); redo('flha.steps'); };
  act.stepDel = (el) => { Ctx.rec.flha.steps.splice(+el.dataset.i, 1); redo('flha.steps'); };
  act.stepsFill = () => {
    const t = (App.JSA_TEMPLATES || {}).inspect; if (!t) return;
    Ctx.rec.flha.steps = t.steps.map((s) => ({ step: s.step, hazard: s.hazard, risk: s.risk, control: s.control, done: '' })); redo('flha.steps');
  };
  act.crewAdd = () => { Ctx.rec.flha.crew.push({ name: '', trade: '', time_in: '', time_out: '', ppe: '', sig: '' }); redo('flha.crew'); };
  act.crewDelV = (el) => { Ctx.rec.flha.crew.splice(+el.dataset.i, 1); redo('flha.crew'); };
  act.dailyRebuild = () => { Ctx.rec.daily.completed = dailyText(Ctx.rec); redo('daily.completed'); };
  // add a hood: save the visit first so the hood links to it
  act.hoodAdd = async () => { await App.saveNow(); location.hash = '#/new/fh?visit=' + Ctx.rec.id; };
  // make PDFs: jump to the package page (generation happens there)
  act.makePack = async () => {
    const v = Ctx.rec, msg = M.visit.validate(v); if (msg) { toast(msg); return; }
    await App.saveNow(); location.hash = '#/pack/' + v.id;
  };
})();
