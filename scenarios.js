/* Quote Lens mock: scenario data. All values are FICTIONAL placeholders (see SPEC.md).
 * No import duty, no FX: each scenario lists only its own drivers.
 * UMD so the same file runs in the browser (file://) and in node tests. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QLScenarios = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // null-propagating arithmetic: UNKNOWN (null) never gets guessed.
  const add = (...a) => (a.some((x) => x === null) ? null : a.reduce((s, x) => s + x, 0));
  const mul = (...a) => (a.some((x) => x === null) ? null : a.reduce((s, x) => s * x, 1));
  const sub = (a, b) => (a === null || b === null ? null : a - b);
  const pctOf = (base, pct) => (base === null || pct === null ? null : (base * pct) / 100);

  // schedule helpers: return null when amount or timing is unknown
  const once = (amount, day) => (amount === null || day === null ? null : [{ day, amount }]);
  const evenly = (amount, n, stepDays) =>
    amount === null || n === null ? null : Array.from({ length: n }, (_, k) => ({ day: stepDays * k, amount: amount / n }));

  const STUDIO = {
    id: 'studio',
    name: '專案型服務',
    sub: '設計／網站／創意工作室',
    role: '主要情境',
    title: '品牌網站設計與開發專案（虛構）',
    blurb: '一張固定價的專案報價：人力與外部成本分期付出，客戶分三筆付款。',
    fields: [
      { id: 'price', group: 'revenue', label: '報價（固定價）', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 30000, step: 100, def: 12000, tag: 'fictional' },
      { id: 'hours', group: 'cost', label: '預估工時', unit: '小時', kind: 'num', min: 0, max: 5000, sliderMax: 400, step: 5, def: 160, tag: 'fictional' },
      { id: 'rate', group: 'cost', label: '內部每小時成本', unit: '$/小時', kind: 'money', min: 0, max: 10000, sliderMax: 120, step: 1, def: 35, tag: 'fictional' },
      { id: 'external', group: 'cost', label: '外部成本（外包、授權、素材）', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 10000, step: 100, def: 1500, tag: 'fictional' },
      { id: 'overrun', group: 'risk', label: '實際工時超出預估', unit: '%', kind: 'pct', min: 0, max: 300, sliderMax: 100, step: 1, def: 0, tag: 'fictional', driver: true },
      { id: 'duration', group: 'timing', label: '專案期間', unit: '天', kind: 'days', int: true, min: 1, max: 365, sliderMax: 180, step: 1, def: 56, tag: 'fictional' },
      { id: 'deposit', group: 'timing', label: '訂金（簽約日收）', unit: '% 報價', kind: 'pct', min: 0, max: 100, sliderMax: 100, step: 5, def: 30, tag: 'fictional' },
      { id: 'milestone', group: 'timing', label: '期中款', unit: '% 報價', kind: 'pct', min: 0, max: 100, sliderMax: 100, step: 5, def: 30, tag: 'fictional' },
      { id: 'delay', group: 'risk', label: '客戶晚付天數（訂金以外）', unit: '天', kind: 'days', int: true, min: 0, max: 365, sliderMax: 120, step: 1, def: 14, tag: 'fictional', driver: true },
      { id: 'capital', group: 'finance', label: '資金成本（年率）', unit: '%/年', kind: 'pct', min: 0, max: 100, sliderMax: 30, step: 0.5, def: 10, tag: 'assumption' },
      { id: 'threshold', group: 'finance', label: '示範門檻：最低利潤率', unit: '% 收入', kind: 'pct', min: 0, max: 100, sliderMax: 60, step: 1, def: 25, tag: 'unvalidated' },
    ],
    crossChecks: [
      (v) => (v.deposit !== null && v.milestone !== null && v.deposit + v.milestone > 100 ? { fields: ['deposit', 'milestone'], msg: '訂金加期中款不能超過 100%' } : null),
    ],
    build(v) {
      const hours = v.hours === null || v.overrun === null ? null : v.hours * (1 + v.overrun / 100);
      const labor = mul(hours, v.rate);
      const n = v.duration === null ? null : Math.floor(v.duration / 7) + 1;
      const finalPct = v.deposit === null || v.milestone === null ? null : 100 - v.deposit - v.milestone;
      const half = v.duration === null ? null : Math.floor(v.duration / 2);
      return {
        revenue: v.price,
        lines: [
          { id: 'labor', label: '人力成本（內部）', amount: labor, schedule: evenly(labor, n, 7) },
          { id: 'external', label: '外部成本', amount: v.external, schedule: once(v.external, 0) },
        ],
        inflows: [
          { id: 'deposit', label: '訂金', amount: pctOf(v.price, v.deposit), day: 0 },
          { id: 'milestone', label: '期中款', amount: pctOf(v.price, v.milestone), day: add(half, v.delay) },
          { id: 'final', label: '尾款', amount: pctOf(v.price, finalPct), day: add(v.duration, v.delay) },
        ],
      };
    },
    shocks: [
      { id: 'hours', label: '實際工時多出 20 個百分點', apply: (v) => ({ ...v, overrun: add(v.overrun, 20) }) },
      { id: 'delay', label: '客戶多晚付 30 天', apply: (v) => ({ ...v, delay: add(v.delay, 30) }) },
      { id: 'price', label: '報價讓價 10%', apply: (v) => ({ ...v, price: mul(v.price, 0.9) }) },
    ],
    breakEven: { field: 'overrun', max: 300, label: (x) => `實際工時超出預估約 ${x.toFixed(1)}% 時，利潤歸零` },
  };

  const CURTAIN = {
    id: 'curtain',
    name: '本地窗簾／軟裝報價',
    sub: '本地中小生意',
    role: '領域驗證（次要）',
    title: '本地住宅窗簾與軟裝訂製（虛構）',
    blurb: '一張含安裝的本地訂製報價：材料先付、工坊加工、到府安裝、客戶分兩筆付款。',
    fields: [
      { id: 'price', group: 'revenue', label: '報價（含安裝）', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 8000, step: 50, def: 2400, tag: 'fictional' },
      { id: 'materials', group: 'cost', label: '布料與五金', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 4000, step: 50, def: 1000, tag: 'fictional' },
      { id: 'tailoring', group: 'cost', label: '加工（外包工坊）', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 2000, step: 50, def: 400, tag: 'fictional' },
      { id: 'installHours', group: 'cost', label: '安裝工時', unit: '小時', kind: 'num', min: 0, max: 500, sliderMax: 24, step: 0.5, def: 6, tag: 'fictional' },
      { id: 'crewRate', group: 'cost', label: '安裝每小時成本', unit: '$/小時', kind: 'money', min: 0, max: 10000, sliderMax: 100, step: 1, def: 25, tag: 'fictional' },
      { id: 'delivery', group: 'cost', label: '運送與交通', unit: '$', kind: 'money', min: 0, max: 10000000, sliderMax: 300, step: 5, def: 40, tag: 'fictional' },
      { id: 'matChange', group: 'risk', label: '材料價格變動', unit: '%', kind: 'pct', min: 0, max: 300, sliderMax: 50, step: 1, def: 0, tag: 'fictional', driver: true },
      { id: 'rework', group: 'risk', label: '返工比例（丈量或裁切錯誤）', unit: '%', kind: 'pct', min: 0, max: 300, sliderMax: 100, step: 1, def: 0, tag: 'fictional', driver: true },
      { id: 'lead', group: 'timing', label: '訂貨到安裝', unit: '天', kind: 'days', int: true, min: 0, max: 365, sliderMax: 60, step: 1, def: 21, tag: 'fictional' },
      { id: 'deposit', group: 'timing', label: '訂金（下單日收）', unit: '% 報價', kind: 'pct', min: 0, max: 100, sliderMax: 100, step: 5, def: 50, tag: 'fictional' },
      { id: 'delay', group: 'risk', label: '客戶晚付天數（尾款）', unit: '天', kind: 'days', int: true, min: 0, max: 365, sliderMax: 60, step: 1, def: 7, tag: 'fictional', driver: true },
      { id: 'capital', group: 'finance', label: '資金成本（年率）', unit: '%/年', kind: 'pct', min: 0, max: 100, sliderMax: 30, step: 0.5, def: 10, tag: 'assumption' },
      { id: 'threshold', group: 'finance', label: '示範門檻：最低利潤率', unit: '% 收入', kind: 'pct', min: 0, max: 100, sliderMax: 60, step: 1, def: 20, tag: 'unvalidated' },
    ],
    crossChecks: [],
    build(v) {
      const mt = v.materials === null || v.matChange === null ? null : v.materials * (1 + v.matChange / 100);
      const reworkCost = v.rework === null ? null : mul(v.rework / 100, add(mt, v.tailoring));
      const install = add(mul(v.installHours, v.crewRate), v.delivery);
      const tailDay = v.lead === null ? null : Math.min(7, v.lead);
      return {
        revenue: v.price,
        lines: [
          { id: 'materials', label: '布料與五金', amount: mt, schedule: once(mt, 0) },
          { id: 'tailoring', label: '加工（外包工坊）', amount: v.tailoring, schedule: once(v.tailoring, tailDay) },
          { id: 'rework', label: '返工', amount: reworkCost, schedule: once(reworkCost, v.lead) },
          { id: 'install', label: '安裝與運送', amount: install, schedule: once(install, v.lead) },
        ],
        inflows: [
          { id: 'deposit', label: '訂金', amount: pctOf(v.price, v.deposit), day: 0 },
          { id: 'balance', label: '尾款', amount: v.deposit === null ? null : pctOf(v.price, 100 - v.deposit), day: add(v.lead, v.delay) },
        ],
      };
    },
    shocks: [
      { id: 'materials', label: '材料價格多漲 10 個百分點', apply: (v) => ({ ...v, matChange: add(v.matChange, 10) }) },
      { id: 'rework', label: '返工比例多 10 個百分點', apply: (v) => ({ ...v, rework: add(v.rework, 10) }) },
      { id: 'delay', label: '客戶多晚付 14 天', apply: (v) => ({ ...v, delay: add(v.delay, 14) }) },
    ],
    breakEven: { field: 'rework', max: 300, label: (x) => `返工比例約 ${x.toFixed(1)}% 時，利潤歸零` },
  };

  const TAGS = {
    fictional: { text: '虛構', title: '虛構佔位值，不是 Paul 驗證過的假設' },
    assumption: { text: '假設', title: '模型假設，可編輯，不是市場資料' },
    unvalidated: { text: '未驗證', title: '示範門檻，未經驗證，不是建議' },
  };

  return { SCENARIOS: { studio: STUDIO, curtain: CURTAIN }, ORDER: ['studio', 'curtain'], TAGS };
});
