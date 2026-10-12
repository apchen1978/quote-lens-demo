/* Quote Lens (public demo): UI. All numbers come from model.js; this file only renders and handles input.
 * Public release: bilingual text (i18n.js), a responsive cash chart whose labels stay readable on phones, and a language
 * switch. The calculations (model.js) and the scenario data (scenarios.js) are used exactly as they were tested. */
(function () {
  'use strict';
  const { SCENARIOS, ORDER } = QLScenarios;
  const I18N = QLI18N;
  const $ = (id) => document.getElementById(id);
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const GROUP_ORDER = ['revenue', 'cost', 'timing', 'risk', 'finance'];

  // ---------- state (scenario values are remembered per scenario; the URL carries the current one) ----------
  const params = new URLSearchParams(location.search);
  const decoded = QL.decodeState(location.search, SCENARIOS);
  let lang = params.get('lang') === 'en' ? 'en' : 'zh';
  const state = { sid: decoded.sid, view: params.get('v') === 'before' ? 'before' : 'after', values: {} };
  for (const id of ORDER) state.values[id] = QL.defaults(SCENARIOS[id]);
  state.values[decoded.sid] = decoded.values;
  const undoStack = { studio: [], curtain: [] };
  const lastKnown = {};
  let lastPush = 0;
  let refs = {};
  let ledgerRefs = {};
  let riskRefs = {};
  let statusTimer = null;
  let lastResult = null;
  let lastChartWidth = -1;

  const scn = () => SCENARIOS[state.sid];
  const vals = () => state.values[state.sid];
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const U = () => I18N.UI[lang];

  // ---------- text for scenario data (Chinese comes from scenarios.js; English is mapped by id in i18n.js) ----------
  const sText = (s) => (lang === 'zh' ? { name: s.name, sub: s.sub, role: s.role, title: s.title, blurb: s.blurb } : I18N.EN_SCN[s.id]);
  const fText = (s, f) => (lang === 'zh' ? [f.label, f.unit] : I18N.EN_SCN[s.id].fields[f.id]);
  const lineLabel = (s, id, zh) => (lang === 'zh' ? zh : I18N.EN_SCN[s.id].lines[id]);
  const shockLabel = (s, sh) => (lang === 'zh' ? sh.label : I18N.EN_SCN[s.id].shocks[sh.id]);
  const beLabel = (s, x) => (lang === 'zh' ? s.breakEven.label(x) : I18N.EN_SCN[s.id].breakEven(x));
  function errText(msg) {
    if (lang === 'zh') return msg;
    const e = U().err;
    if (msg === '請輸入數字，或勾選「不知道」') return e.notNumber;
    if (msg === '不能是負數') return e.negative;
    if (msg === '需要整數天') return e.wholeDays;
    let m = msg.match(/^不能小於 (.+)$/);
    if (m) return e.below(m[1]);
    m = msg.match(/^不能大於 (.+)$/);
    if (m) return e.above(m[1]);
    if (msg === '訂金加期中款不能超過 100%') return e.depMile;
    return msg;
  }

  // ---------- formatting ----------
  const nf = (d) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  function money(x, d) {
    if (x === null || x === undefined) return 'UNKNOWN';
    d = d === undefined ? 0 : d;
    const rounded = Number(Math.abs(x).toFixed(d));
    return (x < 0 && rounded > 0 ? '−' : '') + '$' + nf(d).format(rounded);
  }
  const pct1 = (x) => (x * 100).toFixed(1) + '%';

  // Short count-up/down so a change in a number is visible. A timer always writes the final
  // value, so the number is correct even if animation frames are throttled or paused.
  function tween(el, to, fmt) {
    const from = el._v;
    el._v = to;
    cancelAnimationFrame(el._raf);
    clearTimeout(el._final);
    if (to === null || from === undefined || from === null || reduceMotion || from === to) { el.textContent = fmt(to); return; }
    const t0 = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 200);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
    el._final = setTimeout(() => { cancelAnimationFrame(el._raf); el.textContent = fmt(to); }, 230);
  }

  function say(msg) {
    const s = $('status');
    s.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => { s.textContent = ''; }, 3500);
  }

  // ---------- static text and language ----------
  function applyStatic() {
    const t = U();
    document.documentElement.lang = t.htmlLang;
    document.title = t.docTitle;
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute('content', t.metaDesc);
    document.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t[el.dataset.i18n]; });
    document.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t[el.dataset.i18nAria]); });
    const list = $('ev-list');
    list.textContent = '';
    for (const html of t.ev) { const li = document.createElement('li'); li.innerHTML = html; list.appendChild(li); }
    $('nav-back').href = `https://paulstradecraft.com/?lang=${lang}#quote-lens`;
    document.querySelectorAll('#seg-lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.documentElement.style.setProperty('--first-prefix', JSON.stringify(t.firstPrefix));
  }

  function setLang(next) {
    if (next === lang) return;
    lang = next;
    applyStatic();
    buildScenarioButtons();
    buildAll();
    writeUrl();
  }

  // ---------- controls ----------
  function buildScenarioButtons() {
    const seg = $('seg-scn');
    seg.textContent = '';
    for (const id of ORDER) {
      const s = SCENARIOS[id];
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.sid = id;
      const name = document.createElement('span');
      name.textContent = sText(s).name;
      const sub = document.createElement('small');
      sub.textContent = sText(s).sub;
      b.append(name, sub);
      b.addEventListener('click', () => switchScenario(id));
      seg.appendChild(b);
    }
  }
  function markControls() {
    document.querySelectorAll('#seg-scn button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sid === state.sid)));
    document.querySelectorAll('#seg-view button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === state.view)));
    $('view-before').hidden = state.view !== 'before';
    $('view-after').hidden = state.view !== 'after';
    $('dock').style.visibility = state.view === 'after' ? 'visible' : 'hidden';
    $('undo').disabled = undoStack[state.sid].length === 0;
  }

  function switchScenario(id) {
    if (id === state.sid) return;
    state.sid = id;
    buildAll();
    writeUrl();
    say(U().switched(sText(scn()).name));
  }

  function setView(view) {
    state.view = view;
    markControls();
    writeUrl();
  }

  function writeUrl() {
    const q = QL.encodeState(scn(), vals()) + (state.view === 'before' ? '&v=before' : '') + (lang === 'en' ? '&lang=en' : '');
    history.replaceState(null, '', '?' + q);
  }

  function pushUndo() {
    const now = Date.now();
    if (now - lastPush > 800) undoStack[state.sid].push(copy(vals()));
    lastPush = now;
    if (undoStack[state.sid].length > 50) undoStack[state.sid].shift();
  }

  // ---------- inputs ----------
  function buildInputs() {
    const body = $('inputs-body');
    body.textContent = '';
    refs = {};
    const fields = scn().fields;
    for (const g of GROUP_ORDER) {
      const list = fields.filter((f) => f.group === g);
      if (!list.length) continue;
      const wrap = document.createElement('div');
      wrap.className = 'group';
      const title = document.createElement('p');
      title.className = 'group-title';
      title.textContent = U().groups[g];
      wrap.appendChild(title);
      for (const f of list) wrap.appendChild(buildField(f));
      body.appendChild(wrap);
    }
    syncInputs();
  }

  function buildField(f) {
    const [labelText, unitText] = fText(scn(), f);
    const box = document.createElement('div');
    box.className = 'field';
    const head = document.createElement('div');
    head.className = 'field-head';
    const label = document.createElement('label');
    label.htmlFor = `in-${f.id}`;
    label.textContent = labelText;
    const tag = document.createElement('span');
    tag.className = `tag ${f.tag}`;
    tag.textContent = U().tags[f.tag][0];
    tag.title = U().tags[f.tag][1];
    head.append(label, tag);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'field-body';
    const range = document.createElement('input');
    range.type = 'range';
    range.min = '0';
    range.max = String(f.sliderMax);
    range.step = String(f.step);
    range.setAttribute('aria-label', U().sliderAria(labelText));
    const wrap = document.createElement('span');
    wrap.className = 'numwrap';
    const num = document.createElement('input');
    num.type = 'number';
    num.id = `in-${f.id}`;
    num.step = 'any';
    num.inputMode = 'decimal';
    const unit = document.createElement('span');
    unit.className = 'unit';
    unit.textContent = unitText;
    wrap.append(num, unit);
    const unk = document.createElement('label');
    unk.className = 'unk';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.setAttribute('aria-label', U().unkAria(labelText));
    unk.append(cb, document.createTextNode(U().unkLabel));
    const err = document.createElement('p');
    err.className = 'err';
    err.id = `err-${f.id}`;
    err.hidden = true;
    num.setAttribute('aria-describedby', err.id);
    bodyEl.append(range, wrap, unk, err);
    box.append(head, bodyEl);

    range.addEventListener('input', () => { num.value = range.value; commit(f.id, Number(range.value)); });
    num.addEventListener('input', () => { commit(f.id, num.value === '' ? NaN : Number(num.value)); });
    cb.addEventListener('change', () => {
      if (cb.checked) { lastKnown[f.id] = vals()[f.id]; commit(f.id, null); }
      else commit(f.id, lastKnown[f.id] !== undefined && lastKnown[f.id] !== null && Number.isFinite(lastKnown[f.id]) ? lastKnown[f.id] : f.def);
      syncInputs();
    });
    refs[f.id] = { num, range, cb, err, f };
    return box;
  }

  function syncInputs() {
    const v = vals();
    for (const id of Object.keys(refs)) {
      const r = refs[id];
      const x = v[id];
      r.cb.checked = x === null;
      r.num.disabled = x === null;
      r.range.disabled = x === null;
      if (x === null) { r.num.value = ''; r.range.value = '0'; }
      else if (document.activeElement !== r.num) r.num.value = Number.isFinite(x) ? String(x) : '';
      if (x !== null && Number.isFinite(x)) r.range.value = String(Math.min(x, r.f.sliderMax));
    }
  }

  function commit(id, value) {
    pushUndo();
    vals()[id] = value;
    render();
    writeUrl();
  }

  // ---------- ledger / risks (built once per scenario so bars can animate) ----------
  function mkRow(cls, name) {
    const row = document.createElement('div');
    row.className = `row ${cls}`;
    const n = document.createElement('span');
    n.className = 'name';
    n.textContent = name;
    const val = document.createElement('span');
    val.className = 'val';
    const bar = document.createElement('div');
    bar.className = 'bar';
    const i = document.createElement('i');
    bar.appendChild(i);
    row.append(n, val, bar);
    return { row, val, bar: i };
  }
  function buildLedger() {
    const t = U();
    const body = $('ledger-body');
    body.textContent = '';
    ledgerRefs = { lines: {} };
    const group = (title) => { const g = document.createElement('div'); g.className = 'group'; const p = document.createElement('p'); p.className = 'group-title'; p.textContent = title; g.appendChild(p); body.appendChild(g); return g; };
    const g1 = group(t.ledgerGroups.revenue);
    ledgerRefs.revenue = mkRow('revenue', t.rowQuote); g1.appendChild(ledgerRefs.revenue.row);
    const g2 = group(t.ledgerGroups.direct);
    for (const l of scn().build(QL.defaults(scn())).lines) { const r = mkRow('cost', lineLabel(scn(), l.id, l.label)); ledgerRefs.lines[l.id] = r; g2.appendChild(r.row); }
    ledgerRefs.direct = mkRow('cost total', t.rowDirect); g2.appendChild(ledgerRefs.direct.row);
    const g3 = group(t.ledgerGroups.fin);
    ledgerRefs.fin = mkRow('fin', t.rowFin); g3.appendChild(ledgerRefs.fin.row);
    const g4 = group(t.ledgerGroups.profit);
    ledgerRefs.profit = mkRow('profit total', t.rowProfit); g4.appendChild(ledgerRefs.profit.row);
  }
  function setRow(ref, amount, revenue, dec) {
    ref.val.classList.toggle('unknown', amount === null);
    tween(ref.val, amount, (x) => money(x, dec));
    const w = amount === null || revenue === null || revenue <= 0 ? 0 : Math.max(0, Math.min(100, (amount / revenue) * 100));
    ref.bar.style.width = w + '%';
  }
  function renderLedger(r) {
    const rev = r.status === 'ok' ? r.revenue : null;
    setRow(ledgerRefs.revenue, r.status === 'ok' ? r.revenue : null, rev, 0);
    for (const l of scn().build(QL.defaults(scn())).lines) {
      const line = r.lines.find((x) => x.id === l.id);
      setRow(ledgerRefs.lines[l.id], line ? line.amount : null, rev, 0);
    }
    setRow(ledgerRefs.direct, r.direct, rev, 0);
    setRow(ledgerRefs.fin, r.financing, rev, 2);
    setRow(ledgerRefs.profit, r.profit, rev, 0);
    ledgerRefs.profit.row.classList.toggle('neg', r.profit !== null && r.profit < 0);
    const rate = vals().capital;
    $('fin-note').textContent = rate === null || !Number.isFinite(rate) ? U().finNoRate : U().finNote(rate);
  }

  function buildRisks() {
    const box = $('risk-rows');
    box.textContent = '';
    riskRefs = {};
    for (const s of scn().shocks) {
      const el = document.createElement('div');
      el.className = 'sens';
      const top = document.createElement('div');
      top.className = 'top2';
      const lab = document.createElement('span');
      lab.className = 'label';
      lab.textContent = shockLabel(scn(), s);
      const d = document.createElement('span');
      d.className = 'delta';
      top.append(lab, d);
      const bar = document.createElement('div');
      bar.className = 'bar';
      const i = document.createElement('i');
      bar.appendChild(i);
      el.append(top, bar);
      box.appendChild(el);
      riskRefs[s.id] = { el, d, i };
    }
  }
  function renderRisks() {
    const sens = QL.sensitivity(scn(), vals());
    if (sens.status !== 'ok') {
      for (const id of Object.keys(riskRefs)) { const x = riskRefs[id]; x.d.textContent = 'UNKNOWN'; x.d.classList.add('unknown'); x.i.style.width = '0%'; x.el.classList.remove('first'); }
    } else {
      const max = Math.max(...sens.rows.map((x) => Math.abs(x.delta || 0)), 1e-9);
      sens.rows.forEach((row, idx) => {
        const x = riskRefs[row.id];
        x.d.classList.remove('unknown');
        tween(x.d, row.delta, (n) => (n >= 0 ? '+' : '') + money(n, 0));
        x.i.style.width = Math.min(100, (Math.abs(row.delta) / max) * 100) + '%';
        x.el.classList.toggle('first', idx === 0 && row.delta < 0);
        $('risk-rows').appendChild(x.el); // keep the most harmful first
      });
    }
    const be = QL.breakEven(scn(), vals());
    const el = $('breakeven');
    if (be.state === 'found') el.textContent = U().beFound(beLabel(scn(), be.value));
    else if (be.state === 'already_below') el.textContent = U().beBelow;
    else if (be.state === 'not_reached') el.textContent = U().beNot(be.max);
    else el.textContent = U().beUnknown;
  }

  // ---------- hero, dock, cash chart ----------
  function renderHero(r) {
    const t = U();
    const v = vals();
    const num = $('hero-num');
    const flag = $('hero-flag');
    const miss = $('hero-missing');
    const dockNum = $('dock-num');
    let metaText = '';
    miss.hidden = true;
    num.classList.remove('neg', 'unknown');
    flag.className = 'hero-flag none';
    if (r.status !== 'ok') {
      num.textContent = 'UNKNOWN'; num._v = null; num.classList.add('unknown');
      $('hero-margin').textContent = '';
      flag.textContent = t.invalidHero;
      $('hero-eq').textContent = '';
      dockNum.textContent = 'UNKNOWN'; dockNum._v = null;
      $('dock-meta').textContent = t.invalidShort;
      return;
    }
    if (r.profit === null) {
      num.textContent = 'UNKNOWN'; num._v = null; num.classList.add('unknown');
      $('hero-margin').textContent = '';
      flag.textContent = t.unknownHero;
      const names = r.missing.map((id) => fText(scn(), scn().fields.find((f) => f.id === id))[0]);
      miss.hidden = false;
      miss.textContent = t.missing(names);
      $('hero-eq').textContent = t.eqUnknown(money(r.revenue), money(r.direct), money(r.financing, 2));
      dockNum.textContent = 'UNKNOWN'; dockNum._v = null;
      $('dock-meta').textContent = t.missingShort;
      return;
    }
    tween(num, r.profit, (x) => money(x, 0));
    tween(dockNum, r.profit, (x) => money(x, 0));
    if (r.profit < 0) { num.classList.add('neg'); }
    $('hero-margin').textContent = r.margin === null ? t.marginUnknown : t.margin(pct1(r.margin));
    if (r.threshold.state === 'above') { flag.className = 'hero-flag above'; flag.textContent = t.thrAbove(v.threshold); metaText = t.metaAbove(pct1(r.margin)); }
    else if (r.threshold.state === 'below') { flag.className = 'hero-flag below'; flag.textContent = t.thrBelow(v.threshold); metaText = t.metaBelow(pct1(r.margin)); }
    else { flag.className = 'hero-flag none'; flag.textContent = t.thrNone; metaText = r.margin === null ? t.marginShortUnknown : pct1(r.margin); }
    $('hero-eq').textContent = t.eq(money(r.revenue), money(r.direct), money(r.financing, 2), money(r.profit));
    $('dock-meta').textContent = metaText;
  }

  function renderGap(r) {
    const t = U();
    const num = $('gap-num');
    const day = $('gap-day');
    num.classList.remove('unknown');
    if (r.status !== 'ok' || !r.cash) {
      num.textContent = 'UNKNOWN'; num._v = null; num.classList.add('unknown');
      day.textContent = r.status !== 'ok' ? t.gapInvalid : t.gapMissing;
      return;
    }
    const peak = r.cash.peak;
    if (peak.deficit > 0) {
      tween(num, -peak.deficit, (x) => money(x, 0));
      day.textContent = t.gapDay(peak.day);
    } else {
      tween(num, 0, (x) => money(x, 0));
      day.textContent = t.gapNone;
    }
  }

  // The chart is drawn in the container's real pixel width, so one SVG unit is one screen pixel and the labels stay
  // 12px on phones (an earlier fixed 600-unit drawing was scaled down to about 5.8px on phones).
  function renderCash(r) {
    const t = U();
    const box = $('cash-chart');
    const note = $('cash-note');
    if (!r.cash) {
      box.innerHTML = `<p class="chart-empty">${t.chartEmpty}</p>`;
      note.textContent = '';
      lastChartWidth = -1;
      return;
    }
    const measured = Math.round(box.clientWidth);
    const W = measured > 0 ? Math.max(260, measured) : 600;
    lastChartWidth = measured;
    const narrow = W < 480;
    const H = narrow ? 230 : 200;
    const L = narrow ? 44 : 52, R = 14, T = 18, B = 34;
    let pts = r.cash.points.slice();
    if (pts[0].day > 0) pts.unshift({ day: 0, pos: 0 });
    const last = Math.max(pts[pts.length - 1].day, 1);
    const poss = pts.map((p) => p.pos).concat([0]);
    let lo = Math.min(...poss), hi = Math.max(...poss);
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    const pad = (hi - lo) * 0.08;
    lo -= pad; hi += pad;
    const x = (d) => L + ((W - L - R) * d) / last;
    const y = (p) => T + ((H - T - B) * (hi - p)) / (hi - lo);
    let path = `M${x(pts[0].day)},${y(pts[0].pos)}`;
    let shade = '';
    for (let i = 1; i < pts.length; i++) {
      path += ` H${x(pts[i].day)} V${y(pts[i].pos)}`;
      const prev = pts[i - 1];
      if (prev.pos < 0) shade += `<rect class="neg" x="${x(prev.day)}" y="${y(0)}" width="${Math.max(0, x(pts[i].day) - x(prev.day))}" height="${Math.max(0, y(prev.pos) - y(0))}"></rect>`;
    }
    const peak = r.cash.peak;
    const peakMark = peak.deficit > 0
      ? `<circle class="peak" cx="${x(peak.day)}" cy="${y(-peak.deficit)}" r="4"></circle><text class="peaklabel" x="${x(peak.day) + 8}" y="${Math.min(y(-peak.deficit) + 18, H - B + 12)}">${t.chartPeakLabel(money(peak.deficit), peak.day)}</text>`
      : '';
    const aria = t.chartAria(peak.deficit > 0 ? t.chartPeakAria(money(peak.deficit), peak.day) : t.chartNoneAria);
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${aria}">`
      + shade
      + `<line class="axis" x1="${L}" y1="${y(0)}" x2="${W - R}" y2="${y(0)}"></line>`
      + `<path class="line" d="${path}"></path>`
      + peakMark
      + `<text x="${L - 6}" y="${y(0) + 4}" text-anchor="end">$0</text>`
      + `<text x="${L}" y="${H - 8}">${t.chartDay(0)}</text><text x="${W - R}" y="${H - 8}" text-anchor="end">${t.chartDay(last)}</text>`
      + '</svg>';
    // keep the peak label inside the drawing: flip it to the left of the point when it would run off the right edge
    const label = box.querySelector('text.peaklabel');
    if (label && measured > 0) {
      const bb = label.getBBox();
      if (bb.x + bb.width > W - R) { label.setAttribute('text-anchor', 'end'); label.setAttribute('x', x(peak.day) - 8); }
      const bb2 = label.getBBox();
      if (bb2.x < L - 4) { label.setAttribute('text-anchor', 'start'); label.setAttribute('x', L); }
    }
    note.textContent = peak.deficit > 0 ? t.cashNoteNeg(money(r.financing, 2)) : t.cashNoteNone;
  }

  // ---------- before view (static summary for comparison) ----------
  function renderBefore() {
    const t = U();
    const s = scn();
    const r = QL.compute(s, QL.defaults(s));
    const list = $('before-list');
    list.textContent = '';
    const add = (k, v) => { const d = document.createElement('div'); const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; d.append(dt, dd); list.appendChild(d); };
    add(t.beforeRows.quote, money(r.revenue));
    add(t.beforeRows.cost, money(r.direct));
    add(t.beforeRows.gross, money(r.contribution));
    add(t.beforeRows.margin, pct1(r.contribution / r.revenue));
    $('before-note').textContent = t.beforeNote;
  }

  // ---------- render ----------
  function render() {
    const r = QL.compute(scn(), vals());
    lastResult = r;
    renderHero(r);
    renderGap(r);
    renderLedger(r);
    renderRisks();
    renderCash(r);
    for (const id of Object.keys(refs)) {
      const e = refs[id];
      const msg = r.errors[id];
      e.err.hidden = !msg;
      e.err.textContent = msg ? errText(msg) : '';
      e.num.setAttribute('aria-invalid', msg ? 'true' : 'false');
    }
    $('undo').disabled = undoStack[state.sid].length === 0;
  }

  function buildAll() {
    const st = sText(scn());
    $('scn-role').textContent = st.role;
    $('scn-title').textContent = st.title;
    $('scn-blurb').textContent = st.blurb;
    buildInputs();
    buildLedger();
    buildRisks();
    renderBefore();
    render();
    markControls();
  }

  // ---------- wiring ----------
  $('seg-view').addEventListener('click', (e) => { const b = e.target.closest('button[data-view]'); if (b) setView(b.dataset.view); });
  $('seg-lang').addEventListener('click', (e) => { const b = e.target.closest('button[data-lang]'); if (b) setLang(b.dataset.lang); });
  $('to-after').addEventListener('click', () => setView('after'));
  $('reset').addEventListener('click', () => {
    pushUndo();
    state.values[state.sid] = QL.defaults(scn());
    syncInputs(); render(); writeUrl(); say(U().didReset);
  });
  $('undo').addEventListener('click', () => {
    const prev = undoStack[state.sid].pop();
    if (!prev) return;
    state.values[state.sid] = prev;
    lastPush = 0;
    syncInputs(); render(); writeUrl(); say(U().didUndo);
  });
  $('copy').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); say(U().copied); }
    catch { say(U().copyFail); }
  });

  // redraw the chart when its container changes width (phone rotation, window resize, view toggle)
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      const w = Math.round($('cash-chart').clientWidth);
      if (lastResult && lastResult.cash && w > 0 && w !== lastChartWidth) renderCash(lastResult);
    }).observe($('cash-chart'));
  }

  applyStatic();
  buildScenarioButtons();
  buildAll();
})();
