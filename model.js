/* Quote Lens mock: pure calculation model (no DOM). See SPEC.md for the formulas.
 * Revenue, direct costs, estimated financing cost and profit are kept separate.
 * UNKNOWN is null and is never guessed. UMD: browser (file://) and node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const isNum = (x) => typeof x === 'number' && Number.isFinite(x);

  function defaults(scn) {
    const v = {};
    for (const f of scn.fields) v[f.id] = f.def;
    return v;
  }

  // Input checks. null = UNKNOWN (allowed). opts.limits=false skips the UI max (used for shocks).
  function validate(scn, values, opts) {
    const limits = !opts || opts.limits !== false;
    const errors = {};
    const unknown = [];
    for (const f of scn.fields) {
      const x = values[f.id];
      if (x === null) { unknown.push(f.id); continue; }
      if (!isNum(x)) { errors[f.id] = '請輸入數字，或勾選「不知道」'; continue; }
      if (x < 0) { errors[f.id] = '不能是負數'; continue; }
      if (f.int && !Number.isInteger(x)) { errors[f.id] = '需要整數天'; continue; }
      if (limits && x < f.min) { errors[f.id] = `不能小於 ${f.min}`; continue; }
      if (limits && x > f.max) { errors[f.id] = `不能大於 ${f.max}`; }
    }
    for (const check of scn.crossChecks) {
      const bad = check(values);
      if (bad) for (const id of bad.fields) if (!errors[id]) errors[id] = bad.msg;
    }
    return { ok: Object.keys(errors).length === 0, errors, unknown };
  }

  // Estimated financing cost: r/365 * sum over days 0..T-1 of max(0, -P(d)),
  // computed on event segments (P is constant between events).
  function cashCurve(events) {
    const byDay = new Map();
    for (const e of events) byDay.set(e.day, (byDay.get(e.day) || 0) + e.amount);
    const days = [...byDay.keys()].sort((a, b) => a - b);
    const points = [];
    let pos = 0;
    for (const d of days) { pos += byDay.get(d); points.push({ day: d, pos }); }
    return points;
  }

  function financingCost(points, annualRatePct) {
    const rate = annualRatePct / 100;
    let total = 0;
    let peak = { deficit: 0, day: 0 };
    for (let i = 0; i < points.length; i++) {
      const { day, pos } = points[i];
      if (-pos > peak.deficit) peak = { deficit: -pos, day };
      const next = points[i + 1];
      if (next && pos < 0) total += ((rate / 365) * -pos * (next.day - day));
    }
    return { total, peak };
  }

  function compute(scn, values, opts) {
    const check = validate(scn, values, opts);
    const empty = { status: 'invalid', errors: check.errors, unknown: check.unknown, revenue: null, lines: [], direct: null, contribution: null, financing: null, profit: null, margin: null, threshold: { pct: null, state: 'unknown' }, cash: null, missing: [] };
    if (!check.ok) return empty;

    const b = scn.build(values);
    const lines = b.lines.map((l) => ({ id: l.id, label: l.label, amount: l.amount }));
    const revenue = b.revenue;
    const direct = lines.some((l) => l.amount === null) ? null : lines.reduce((s, l) => s + l.amount, 0);
    const contribution = revenue === null || direct === null ? null : revenue - direct;

    // cash events are only complete when every schedule, inflow and the rate are known
    let events = [];
    let complete = values.capital !== null;
    for (const l of b.lines) {
      if (l.schedule === null) { complete = false; continue; }
      for (const s of l.schedule) events.push({ day: s.day, amount: -s.amount, label: l.label });
    }
    for (const i of b.inflows) {
      if (i.amount === null || i.day === null) { complete = false; continue; }
      events.push({ day: i.day, amount: i.amount, label: i.label });
    }
    let financing = null;
    let cash = null;
    if (complete && revenue !== null) {
      const points = cashCurve(events);
      const fin = financingCost(points, values.capital);
      financing = fin.total;
      cash = { events, points, peak: fin.peak, lastDay: points.length ? points[points.length - 1].day : 0 };
    }
    const profit = revenue === null || direct === null || financing === null ? null : revenue - direct - financing;
    const margin = profit === null || revenue === 0 ? null : profit / revenue;
    let thr = { pct: values.threshold, state: 'unknown' };
    if (margin !== null && values.threshold !== null) thr = { pct: values.threshold, state: margin * 100 >= values.threshold ? 'above' : 'below' };
    return { status: 'ok', errors: {}, unknown: check.unknown, revenue, lines, direct, contribution, financing, profit, margin, threshold: thr, cash, missing: check.unknown.slice() };
  }

  // What changes profit most? Standard shocks are illustrative sizes, not market data.
  function sensitivity(scn, values) {
    const base = compute(scn, values);
    if (base.status !== 'ok' || base.profit === null) return { status: 'unknown', rows: [] };
    const rows = scn.shocks.map((s) => {
      const r = compute(scn, s.apply(values), { limits: false });
      const profit = r.profit;
      return { id: s.id, label: s.label, profit, delta: profit === null ? null : profit - base.profit, margin: r.margin };
    });
    rows.sort((a, b) => (a.delta === null ? 1 : b.delta === null ? -1 : a.delta - b.delta));
    return { status: 'ok', base: base.profit, rows };
  }

  // Smallest driver value (>= current) at which profit reaches 0, by bisection.
  function breakEven(scn, values) {
    const base = compute(scn, values);
    if (base.status !== 'ok' || base.profit === null) return { state: 'unknown' };
    if (base.profit <= 0) return { state: 'already_below' };
    const key = scn.breakEven.field;
    const profitAt = (x) => compute(scn, { ...values, [key]: x }, { limits: false }).profit;
    let lo = values[key];
    let up = scn.breakEven.max;
    if (profitAt(up) > 0) return { state: 'not_reached', max: up };
    for (let i = 0; i < 80; i++) {
      const mid = (lo + up) / 2;
      if (profitAt(mid) > 0) lo = mid; else up = mid;
    }
    return { state: 'found', value: (lo + up) / 2 };
  }

  // URL state: only non-default numbers; unknown is "u"; anything else is ignored.
  function encodeState(scn, values) {
    const p = new URLSearchParams();
    p.set('s', scn.id);
    for (const f of scn.fields) {
      const x = values[f.id];
      if (x === null) p.set(f.id, 'u');
      else if (isNum(x) && x !== f.def) p.set(f.id, String(x));
    }
    return p.toString();
  }

  function decodeState(search, scenarios) {
    const p = new URLSearchParams(search || '');
    const sid = scenarios[p.get('s')] ? p.get('s') : 'studio';
    const scn = scenarios[sid];
    const values = defaults(scn);
    for (const f of scn.fields) {
      if (!p.has(f.id)) continue;
      const raw = p.get(f.id);
      if (raw === 'u') { values[f.id] = null; continue; }
      if (raw === '' || !/^\d+(\.\d+)?$/.test(raw)) continue;
      const x = Number(raw);
      if (isNum(x)) values[f.id] = x;
    }
    return { sid, values };
  }

  return { defaults, validate, compute, sensitivity, breakEven, encodeState, decodeState, cashCurve, financingCost };
});
