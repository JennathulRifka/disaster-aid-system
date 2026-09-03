/**
 * Core training logic for the flood risk model — shared by the CLI script
 * (scripts/train-flood-risk-model.js) and the admin-triggered "Retrain
 * model" button (POST /api/external/flood-risk/retrain in external.js), so
 * there's exactly one implementation to keep correct rather than two
 * copies drifting apart.
 *
 * See scripts/train-flood-risk-model.js's original header (still accurate)
 * for the full story on why these two data sources specifically:
 *   1. server/src/data/desinventar-flood-records.json — 8,182 real
 *      historical flood incident reports for Sri Lanka, 1981-2020, from
 *      UNDRR's DesInventar Sri Lanka disaster database.
 *   2. NASA POWER's free Daily API — real historical daily rainfall,
 *      MERRA2/GEOS reanalysis, no API key needed, data starts 1981-01-01.
 *
 * Takes ~30-60s (25 sequential NASA POWER calls, rate-limited to be polite
 * to a free public API) — callers should treat this as a slow operation,
 * not something to await inline without telling the user it'll take a
 * moment.
 */

const fs = require("fs");
const path = require("path");
const { DISTRICTS } = require("./districts");

const TRAIN_START_YEAR = 1981;
const TRAIN_END_YEAR = 2020; // last year with DesInventar coverage for Sri Lanka

// DesInventar spells this district "Moneragala"; this project (matching the
// Survey Department spelling used everywhere else in this app) uses
// "Monaragala" — same class of fix as RESERVOIR_DISTRICT_ALIASES.
const DESINVENTAR_DISTRICT_ALIASES = {
  Moneragala: "Monaragala",
};

const MODEL_PATH = path.join(__dirname, "../data/flood-risk-model.json");
const RECORDS_PATH = path.join(__dirname, "../data/desinventar-flood-records.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDailyRainfall(lat, lng) {
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG` +
    `&longitude=${lng}&latitude=${lat}&start=${TRAIN_START_YEAR}0101&end=${TRAIN_END_YEAR}1231&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER request failed: ${res.status}`);
  const data = await res.json();
  const series = data?.properties?.parameter?.PRECTOTCORR;
  if (!series) throw new Error("NASA POWER response missing PRECTOTCORR series");
  return series; // { "19810101": 14.59, ... } mm/day, -999 = missing
}

/** Sums daily rainfall (mm) for a given year-month, and separately the 30 days before that month started. */
function monthlyFeatures(dailySeries, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  let monthTotal = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${year}${String(month).padStart(2, "0")}${String(d).padStart(2, "0")}`;
    const v = dailySeries[key];
    if (typeof v === "number" && v > -900) monthTotal += v;
  }

  // Antecedent rainfall: the 30 days immediately before this month began —
  // a standard flood-risk signal (soil saturation / catchment wetness),
  // not just "how much rain fell in the month we're scoring."
  let prior30Total = 0;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  for (let i = 1; i <= 30; i++) {
    const d = new Date(monthStart);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const v = dailySeries[key];
    if (typeof v === "number" && v > -900) prior30Total += v;
  }

  return { monthTotalMm: monthTotal, prior30dMm: prior30Total };
}

/** Plain logistic regression trained with batch gradient descent — small
 * enough feature set (5 inputs) that a hand-rolled trainer is clearer and
 * more auditable for a dissertation than pulling in an ML dependency. */
function trainLogisticRegression(X, y, { epochs = 3000, lr = 0.3, l2 = 0.001 } = {}) {
  const n = X.length;
  const nFeatures = X[0].length;
  let weights = new Array(nFeatures).fill(0);
  let bias = 0;

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradW = new Array(nFeatures).fill(0);
    let gradB = 0;
    for (let i = 0; i < n; i++) {
      let z = bias;
      for (let j = 0; j < nFeatures; j++) z += weights[j] * X[i][j];
      const pred = sigmoid(z);
      const error = pred - y[i];
      for (let j = 0; j < nFeatures; j++) gradW[j] += error * X[i][j];
      gradB += error;
    }
    for (let j = 0; j < nFeatures; j++) {
      weights[j] -= lr * (gradW[j] / n + l2 * weights[j]);
    }
    bias -= lr * (gradB / n);
  }

  return { weights, bias };
}

function standardize(X) {
  const nFeatures = X[0].length;
  const means = new Array(nFeatures).fill(0);
  const stds = new Array(nFeatures).fill(1);
  for (let j = 0; j < nFeatures; j++) {
    const col = X.map((row) => row[j]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length;
    means[j] = mean;
    stds[j] = Math.sqrt(variance) || 1;
  }
  const Xs = X.map((row) => row.map((v, j) => (v - means[j]) / stds[j]));
  return { Xs, means, stds };
}

/**
 * Runs the full training pipeline and writes src/data/flood-risk-model.json.
 * `onProgress(message)` is called at each notable step (e.g. "Fetching
 * NASA POWER rainfall for Colombo...") so a caller — the CLI script's
 * console.log, or a future streaming API — can surface progress; defaults
 * to a no-op so callers that don't care can omit it.
 *
 * Returns the trained model object (the same one written to disk).
 */
async function trainFloodRiskModel({ onProgress = () => {} } = {}) {
  onProgress("Loading DesInventar flood records...");
  const rawRecords = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));

  const floodMonths = new Set(); // `${district}|${year}|${month}`
  for (const r of rawRecords) {
    const district = DESINVENTAR_DISTRICT_ALIASES[r.district] || r.district;
    if (!district || r.year < TRAIN_START_YEAR || r.year > TRAIN_END_YEAR) continue;
    floodMonths.add(`${district}|${r.year}|${r.month}`);
  }
  onProgress(`Loaded ${rawRecords.length} raw records -> ${floodMonths.size} distinct district-months with a reported flood.`);

  // Each district's overall historical flood-month frequency (across every
  // month/year in the training window) — a per-district propensity signal.
  // See the header comment in the old script (and CLAUDE.md's "Flood risk
  // forecast (ML)" section) for why this is included despite the soft
  // data-leakage tradeoff it carries.
  const totalYearsMonths = (TRAIN_END_YEAR - TRAIN_START_YEAR + 1) * 12;
  const districtOverallRate = {};
  for (const district of DISTRICTS) {
    let positives = 0;
    for (let year = TRAIN_START_YEAR; year <= TRAIN_END_YEAR; year++) {
      for (let month = 1; month <= 12; month++) {
        if (floodMonths.has(`${district.name}|${year}|${month}`)) positives++;
      }
    }
    districtOverallRate[district.name] = positives / totalYearsMonths;
  }

  const samples = []; // { district, year, month, features: [...], label }

  for (const district of DISTRICTS) {
    onProgress(`Fetching NASA POWER historical rainfall for ${district.name}...`);
    const dailySeries = await fetchDailyRainfall(district.lat, district.lng);
    await sleep(300); // be polite to a free public API

    for (let year = TRAIN_START_YEAR; year <= TRAIN_END_YEAR; year++) {
      for (let month = 1; month <= 12; month++) {
        const { monthTotalMm, prior30dMm } = monthlyFeatures(dailySeries, year, month);
        const monthAngle = (2 * Math.PI * (month - 1)) / 12;
        const label = floodMonths.has(`${district.name}|${year}|${month}`) ? 1 : 0;
        samples.push({
          district: district.name,
          year,
          month,
          features: [monthTotalMm, prior30dMm, Math.sin(monthAngle), Math.cos(monthAngle), districtOverallRate[district.name]],
          label,
        });
      }
    }
  }

  onProgress(`Built ${samples.length} training samples (${samples.filter((s) => s.label === 1).length} positive).`);

  // Per-district historical base rate per calendar month — used at serving
  // time as a fallback/sanity signal alongside the trained model, and shown
  // directly to the user as the "why" behind a risk score.
  const districtMonthBaseRate = {};
  for (const district of DISTRICTS) {
    districtMonthBaseRate[district.name] = {};
    for (let month = 1; month <= 12; month++) {
      const monthSamples = samples.filter((s) => s.district === district.name && s.month === month);
      const positives = monthSamples.filter((s) => s.label === 1).length;
      districtMonthBaseRate[district.name][month] = monthSamples.length ? positives / monthSamples.length : 0;
    }
  }

  const X = samples.map((s) => s.features);
  const y = samples.map((s) => s.label);
  const { Xs, means, stds } = standardize(X);
  const { weights, bias } = trainLogisticRegression(Xs, y);

  const sigmoid = (z) => 1 / (1 + Math.exp(-z));
  const probs = Xs.map((row) => {
    let z = bias;
    for (let j = 0; j < weights.length; j++) z += weights[j] * row[j];
    return sigmoid(z);
  });

  // Raw 0.5-threshold accuracy is misleading here — only ~10% of samples
  // are positive, so "always predict no flood" already scores ~90%. What
  // actually matters for a risk *ranking* is whether high-probability
  // months are genuinely more flood-prone than low-probability ones — a
  // top-decile precision check, not a threshold accuracy check.
  let correct = 0;
  for (let i = 0; i < Xs.length; i++) {
    if ((probs[i] >= 0.5 ? 1 : 0) === y[i]) correct++;
  }
  const accuracy = correct / Xs.length;

  const ranked = probs.map((p, i) => ({ p, label: y[i] })).sort((a, b) => b.p - a.p);
  const topDecileSize = Math.round(ranked.length * 0.1);
  const topDecilePositives = ranked.slice(0, topDecileSize).filter((r) => r.label === 1).length;
  const topDecilePrecision = topDecilePositives / topDecileSize;
  const baseRate = y.filter((v) => v === 1).length / y.length;

  onProgress(
    `In-sample accuracy: ${(accuracy * 100).toFixed(1)}% (baseline "always no": ${((1 - baseRate) * 100).toFixed(1)}%). ` +
      `Top-decile precision: ${(topDecilePrecision * 100).toFixed(1)}% vs ${(baseRate * 100).toFixed(1)}% base rate.`
  );

  const model = {
    version: 1,
    trainedAt: new Date().toISOString(),
    trainingWindow: { startYear: TRAIN_START_YEAR, endYear: TRAIN_END_YEAR },
    sampleCount: samples.length,
    positiveCount: samples.filter((s) => s.label === 1).length,
    inSampleAccuracy: accuracy,
    topDecilePrecision,
    baseRate,
    featureNames: ["monthTotalRainfallMm", "prior30dRainfallMm", "monthSin", "monthCos", "districtOverallRate"],
    featureMeans: means,
    featureStds: stds,
    weights,
    bias,
    districtMonthBaseRate,
    districtOverallRate,
    sources: [
      "UNDRR DesInventar Sri Lanka (https://www.desinventar.net) - historical flood incident reports, 1981-2020",
      "NASA POWER Daily API (https://power.larc.nasa.gov) - historical daily precipitation, MERRA2/GEOS reanalysis",
    ],
  };

  fs.writeFileSync(MODEL_PATH, JSON.stringify(model, null, 2));
  onProgress(`Model written to ${MODEL_PATH}`);

  // Per-sample predictions vs. real labels — attached to the return value
  // only (never persisted to the served model file, which stays lean for
  // request-time loading) so a separate evaluation script can compute a
  // confusion matrix / precision / recall without re-deriving features from
  // scratch or re-fetching NASA POWER data a second time.
  const evaluationRecords = samples.map((s, i) => ({
    district: s.district,
    year: s.year,
    month: s.month,
    label: s.label,
    probability: probs[i],
  }));

  return { ...model, evaluationRecords };
}

module.exports = { trainFloodRiskModel, MODEL_PATH };
