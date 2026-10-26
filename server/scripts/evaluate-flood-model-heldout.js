/**
 * Held-out (temporal split) evaluation of the flood-risk logistic regression.
 *
 * Why this exists: the original evaluation (evaluate-flood-model.js) is
 * in-sample, and the "district historical flood rate" feature is computed
 * from the same labels it predicts (data leakage). This script fixes both:
 *   - trains on 1981-2010, tests on 2011-2019 (2020 is excluded because
 *     DesInventar has almost no Sri Lanka records for that year);
 *   - (the former district-historical-rate feature has since been removed from the model);
 *   - compares against climatology baselines (district-month rate,
 *     month-only rate) built from training years only;
 *   - reports AUC-ROC, average precision (PR-AUC), Brier score,
 *     top-decile precision, a 10-bin calibration table, the hyperparameters,
 *     and a one-feature-at-a-time ablation.
 *
 * Run from the server folder (needs internet for NASA POWER, ~30-60 s):
 *     node scripts/evaluate-flood-model-heldout.js
 * Writes ml-heldout-report.json and ml-heldout-report.md next to package.json.
 * Does NOT touch the deployed model file.
 */
const fs = require("fs");
const path = require("path");
const { DISTRICTS } = require("../src/utils/districts");

const START = 1981, TRAIN_END = 2010, TEST_START = 2011, TEST_END = 2019;
const HYPER = { epochs: 3000, lr: 0.3, l2: 0.001, standardisation: "z-score (train stats)", classWeighting: "none" };
const ALIASES = { Moneragala: "Monaragala" };
const FEATURES = ["monthRainfallMm", "prior30dRainfallMm", "monthSin", "monthCos"];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

async function fetchDaily(lat, lng) {
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG` +
    `&longitude=${lng}&latitude=${lat}&start=${START}0101&end=${TEST_END}1231&format=JSON`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const s = (await res.json())?.properties?.parameter?.PRECTOTCORR;
      if (!s) throw new Error("missing PRECTOTCORR");
      return s;
    } catch (e) {
      if (attempt === 3) throw e;
      await sleep(2000 * attempt);
    }
  }
}

function monthly(series, year, month) {
  const days = new Date(year, month, 0).getDate();
  let tot = 0;
  for (let d = 1; d <= days; d++) {
    const v = series[`${year}${String(month).padStart(2, "0")}${String(d).padStart(2, "0")}`];
    if (typeof v === "number" && v > -900) tot += v;
  }
  let prior = 0;
  const start = new Date(Date.UTC(year, month - 1, 1));
  for (let i = 1; i <= 30; i++) {
    const d = new Date(start); d.setUTCDate(d.getUTCDate() - i);
    const v = series[`${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`];
    if (typeof v === "number" && v > -900) prior += v;
  }
  return [tot, prior];
}

function train(X, y, { epochs, lr, l2 }) {
  const n = X.length, k = X[0].length;
  let w = new Array(k).fill(0), b = 0;
  for (let e = 0; e < epochs; e++) {
    const g = new Array(k).fill(0); let gb = 0;
    for (let i = 0; i < n; i++) {
      let z = b; for (let j = 0; j < k; j++) z += w[j] * X[i][j];
      const err = sigmoid(z) - y[i];
      for (let j = 0; j < k; j++) g[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < k; j++) w[j] -= lr * (g[j] / n + l2 * w[j]);
    b -= lr * (gb / n);
  }
  return { w, b };
}

function auc(y, p) {
  const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
  let rank = 0, sumPos = 0, nPos = 0;
  for (let i = 0; i < idx.length;) {
    let j = i; while (j < idx.length && p[idx[j]] === p[idx[i]]) j++;
    const avg = (i + j + 1) / 2; // average rank for ties (1-based)
    for (let k = i; k < j; k++) if (y[idx[k]] === 1) { sumPos += avg; nPos++; }
    i = j;
  }
  const nNeg = y.length - nPos;
  return (sumPos - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}
function avgPrecision(y, p) {
  const idx = p.map((v, i) => i).sort((a, b) => p[b] - p[a]);
  const nPos = y.filter((v) => v === 1).length; let tp = 0, ap = 0;
  idx.forEach((i, r) => { if (y[i] === 1) { tp++; ap += tp / (r + 1); } });
  return ap / nPos;
}
const brier = (y, p) => y.reduce((s, v, i) => s + (p[i] - v) ** 2, 0) / y.length;
function topDecile(y, p) {
  const idx = p.map((v, i) => i).sort((a, b) => p[b] - p[a]).slice(0, Math.round(p.length * 0.1));
  return idx.filter((i) => y[i] === 1).length / idx.length;
}
function calibration(y, p) {
  const bins = Array.from({ length: 10 }, () => ({ n: 0, meanP: 0, obs: 0 }));
  p.forEach((v, i) => { const b = Math.min(9, Math.floor(v * 10)); bins[b].n++; bins[b].meanP += v; bins[b].obs += y[i]; });
  return bins.map((b, i) => ({ bin: `${i / 10}-${(i + 1) / 10}`, n: b.n, meanPredicted: b.n ? b.meanP / b.n : null, observedRate: b.n ? b.obs / b.n : null }));
}
function metrics(y, p) {
  return { auc: auc(y, p), averagePrecision: avgPrecision(y, p), brier: brier(y, p), topDecilePrecision: topDecile(y, p) };
}

(async () => {
  const recs = JSON.parse(fs.readFileSync(path.join(__dirname, "../src/data/desinventar-flood-records.json"), "utf8"));
  const flood = new Set();
  for (const r of recs) flood.add(`${ALIASES[r.district] || r.district}|${r.year}|${r.month}`);
  const lab = (d, y, m) => (flood.has(`${d}|${y}|${m}`) ? 1 : 0);

  const trainYears = []; for (let y = START; y <= TRAIN_END; y++) trainYears.push(y);
  const dmRate = {}, mRate = {};
  for (const d of DISTRICTS) {
    for (let m = 1; m <= 12; m++) dmRate[`${d.name}|${m}`] = trainYears.reduce((s, y) => s + lab(d.name, y, m), 0) / trainYears.length;
  }
  for (let m = 1; m <= 12; m++) mRate[m] = DISTRICTS.reduce((s, d) => s + dmRate[`${d.name}|${m}`], 0) / DISTRICTS.length;

  const tr = [], te = [];
  for (const d of DISTRICTS) {
    process.stdout.write(`NASA POWER: ${d.name}\n`);
    const s = await fetchDaily(d.lat, d.lng); await sleep(300);
    for (let y = START; y <= TEST_END; y++) for (let m = 1; m <= 12; m++) {
      const [tot, prior] = monthly(s, y, m); const a = (2 * Math.PI * (m - 1)) / 12;
      const row = { d: d.name, y, m, x: [tot, prior, Math.sin(a), Math.cos(a)], label: lab(d.name, y, m) };
      if (y <= TRAIN_END) tr.push(row); else if (y >= TEST_START) te.push(row);
    }
  }

  function fitAndScore(cols) {
    const Xtr = tr.map((r) => cols.map((c) => r.x[c]));
    const means = cols.map((_, j) => Xtr.reduce((s, r) => s + r[j], 0) / Xtr.length);
    const sds = cols.map((_, j) => Math.sqrt(Xtr.reduce((s, r) => s + (r[j] - means[j]) ** 2, 0) / Xtr.length) || 1);
    const z = (X) => X.map((r) => r.map((v, j) => (v - means[j]) / sds[j]));
    const { w, b } = train(z(Xtr), tr.map((r) => r.label), HYPER);
    const Xte = z(te.map((r) => cols.map((c) => r.x[c])));
    return { w, b, p: Xte.map((r) => sigmoid(r.reduce((s, v, j) => s + v * w[j], b))) };
  }

  const yte = te.map((r) => r.label);
  const full = fitAndScore([0, 1, 2, 3]);
  const report = {
    generatedAt: new Date().toISOString(),
    split: { train: `${START}-${TRAIN_END}`, test: `${TEST_START}-${TEST_END}`, trainSamples: tr.length, testSamples: te.length,
      trainPositiveRate: tr.reduce((s, r) => s + r.label, 0) / tr.length, testPositiveRate: yte.reduce((s, v) => s + v, 0) / yte.length },
    hyperparameters: HYPER,
    features: FEATURES,
    model: { weights: full.w, bias: full.b, ...metrics(yte, full.p) },
    baselines: {
      climatologyDistrictMonth: metrics(yte, te.map((r) => dmRate[`${r.d}|${r.m}`])),
      climatologyMonthOnly: metrics(yte, te.map((r) => mRate[r.m])),
      constantTrainRate: { brier: brier(yte, te.map(() => tr.reduce((s, r) => s + r.label, 0) / tr.length)) },
    },
    ablation: {},
    calibration: calibration(yte, full.p),
  };
  for (let drop = 0; drop < FEATURES.length; drop++) {
    const cols = FEATURES.map((_, c) => c).filter((c) => c !== drop);
    report.ablation[`without_${FEATURES[drop]}`] = metrics(yte, fitAndScore(cols).p);
  }
  fs.writeFileSync(path.join(__dirname, "../ml-heldout-report.json"), JSON.stringify(report, null, 2));
  const f = (v) => (v == null ? "-" : v.toFixed(3));
  let md = `# Flood-risk model: held-out evaluation\n\nTrain ${report.split.train} (${tr.length} samples), test ${report.split.test} (${te.length} samples). ` +
    `Positive rate train ${f(report.split.trainPositiveRate)}, test ${f(report.split.testPositiveRate)}.\n\n` +
    `| Model | AUC-ROC | PR-AUC | Brier | Top-decile precision |\n|---|---|---|---|---|\n` +
    `| Logistic regression | ${f(report.model.auc)} | ${f(report.model.averagePrecision)} | ${f(report.model.brier)} | ${f(report.model.topDecilePrecision)} |\n` +
    `| Climatology (district x month) | ${f(report.baselines.climatologyDistrictMonth.auc)} | ${f(report.baselines.climatologyDistrictMonth.averagePrecision)} | ${f(report.baselines.climatologyDistrictMonth.brier)} | ${f(report.baselines.climatologyDistrictMonth.topDecilePrecision)} |\n` +
    `| Climatology (month only) | ${f(report.baselines.climatologyMonthOnly.auc)} | ${f(report.baselines.climatologyMonthOnly.averagePrecision)} | ${f(report.baselines.climatologyMonthOnly.brier)} | ${f(report.baselines.climatologyMonthOnly.topDecilePrecision)} |\n` +
    `| Constant (train base rate) | - | - | ${f(report.baselines.constantTrainRate.brier)} | - |\n\n## Ablation (drop one feature)\n\n| Dropped | AUC | PR-AUC | Brier |\n|---|---|---|---|\n` +
    Object.entries(report.ablation).map(([k, v]) => `| ${k} | ${f(v.auc)} | ${f(v.averagePrecision)} | ${f(v.brier)} |`).join("\n") +
    `\n\n## Calibration (test set)\n\n| Bin | n | Mean predicted | Observed |\n|---|---|---|---|\n` +
    report.calibration.map((c) => `| ${c.bin} | ${c.n} | ${f(c.meanPredicted)} | ${f(c.observedRate)} |`).join("\n") +
    `\n\nHyperparameters: ${JSON.stringify(HYPER)}\n`;
  fs.writeFileSync(path.join(__dirname, "../ml-heldout-report.md"), md);
  console.log(md);
})().catch((e) => { console.error(e); process.exit(1); });
