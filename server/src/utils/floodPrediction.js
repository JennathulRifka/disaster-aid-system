/**
 * Serves predictions from the flood risk model trained offline by
 * scripts/train-flood-risk-model.js (see that file's header for the full
 * data-sources story: real DesInventar historical flood records + real
 * NASA POWER historical rainfall, 1981-2020, no synthetic data).
 *
 * This is a genuine trained model (logistic regression, real coefficients
 * loaded from src/data/flood-risk-model.json) — not a static lookup table.
 * At request time it only needs to compute features for the CURRENT month
 * per district (a live NASA POWER call, cheap and cached) and run them
 * through the already-trained weights; no retraining happens here.
 */

const fs = require("fs");
const path = require("path");
const { DISTRICTS } = require("./districts");

const MODEL_PATH = path.join(__dirname, "../data/flood-risk-model.json");
let model = null;

function loadModel() {
  try {
    model = JSON.parse(fs.readFileSync(MODEL_PATH, "utf8"));
  } catch (err) {
    console.error(
      "Flood risk model not found or unreadable at",
      MODEL_PATH,
      "- run `node scripts/train-flood-risk-model.js` from server/, or use the admin \"Retrain model\" button. Predictions will be unavailable until then.",
      err.message
    );
  }
}
loadModel();

/** Re-reads the model file from disk — called after the admin "Retrain
 * model" button finishes writing a fresh one, so the already-running
 * server process picks it up immediately instead of needing a restart. */
function reloadModel() {
  loadModel();
}

const RISK_LEVELS = [
  { max: 0.15, level: "low" },
  { max: 0.3, level: "moderate" },
  { max: 0.5, level: "elevated" },
  { max: Infinity, level: "high" },
];

function riskLevelFor(probability) {
  return RISK_LEVELS.find((r) => probability <= r.max).level;
}

function sigmoid(z) {
  return 1 / (1 + Math.exp(-z));
}

async function fetchRecentDailyRainfall(lat, lng, daysBack) {
  const end = new Date();
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - daysBack);
  const fmt = (d) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point?parameters=PRECTOTCORR&community=AG` +
    `&longitude=${lng}&latitude=${lat}&start=${fmt(start)}&end=${fmt(end)}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER request failed: ${res.status}`);
  const data = await res.json();
  return data?.properties?.parameter?.PRECTOTCORR || {};
}

/**
 * Computes this month's rainfall-so-far, projected to a full-month total
 * (rate-scaled by days elapsed) so it's on the same scale as the training
 * features (which used complete historical months) — an early-month
 * reading otherwise looks artificially dry next to a full month's total.
 *
 * NASA POWER's near-real-time data has a real ~2-3 day publishing lag
 * (confirmed directly against the live API), so in the first few days of
 * any month `countedDays` can be 0 — with no fallback this would feed the
 * model "zero rain this month" right when the model's biggest feature
 * weight is on that exact number, silently flattening every district to
 * "low risk" regardless of real recent conditions. Falls back to the
 * average daily rate from `recentDailyMm` (the last several fully-reported
 * days, independent of calendar-month boundaries) instead of zero.
 */
function currentMonthProjectedTotal(dailySeries, now, recentDailyMm) {
  const daysElapsed = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  let soFar = 0;
  let countedDays = 0;
  for (let d = 1; d <= daysElapsed; d++) {
    const key = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(d).padStart(2, "0")}`;
    const v = dailySeries[key];
    if (typeof v === "number" && v > -900) {
      soFar += v;
      countedDays++;
    }
  }
  if (countedDays === 0) {
    const projectedTotalMm = (recentDailyMm ?? 0) * daysInMonth;
    return { projectedTotalMm, soFarMm: 0, countedDays: 0, usedFallbackRate: true };
  }
  const projectedTotalMm = (soFar / countedDays) * daysInMonth;
  return { projectedTotalMm, soFarMm: soFar, countedDays, usedFallbackRate: false };
}

/** Average daily rainfall over the most recent N fully-reported days in
 * `dailySeries` (skips missing/-999 days entirely — doesn't just average
 * over N and let gaps drag the rate down). */
function recentAverageDailyRate(dailySeries, now, lookbackDays = 10) {
  let total = 0;
  let counted = 0;
  for (let i = 0; i <= lookbackDays + 10 && counted < lookbackDays; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const v = dailySeries[key];
    if (typeof v === "number" && v > -900) {
      total += v;
      counted++;
    }
  }
  return counted > 0 ? total / counted : 0;
}

function prior30dTotal(dailySeries, monthStart) {
  let total = 0;
  for (let i = 1; i <= 30; i++) {
    const d = new Date(monthStart);
    d.setUTCDate(d.getUTCDate() - i);
    const key = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
    const v = dailySeries[key];
    if (typeof v === "number" && v > -900) total += v;
  }
  return total;
}

function standardizeFeature(value, index) {
  return (value - model.featureMeans[index]) / model.featureStds[index];
}

function predictFromFeatures(rawFeatures) {
  let z = model.bias;
  for (let j = 0; j < rawFeatures.length; j++) {
    z += model.weights[j] * standardizeFeature(rawFeatures[j], j);
  }
  return sigmoid(z);
}

/** Predicts flood risk for every district for the current calendar month. */
async function predictAllDistricts() {
  if (!model) return [];
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const month = now.getUTCMonth() + 1;
  const monthAngle = (2 * Math.PI * (month - 1)) / 12;

  const results = [];
  for (const district of DISTRICTS) {
    try {
      // 40 days back covers "prior 30 days before this month started" even
      // when we're early in the current month.
      const dailySeries = await fetchRecentDailyRainfall(district.lat, district.lng, 40 + now.getUTCDate());
      const recentRate = recentAverageDailyRate(dailySeries, now);
      const { projectedTotalMm, soFarMm, countedDays, usedFallbackRate } = currentMonthProjectedTotal(dailySeries, now, recentRate);
      const prior30dMm = prior30dTotal(dailySeries, monthStart);
      const districtRate = model.districtOverallRate[district.name] ?? 0;

      const probability = predictFromFeatures([projectedTotalMm, prior30dMm, Math.sin(monthAngle), Math.cos(monthAngle), districtRate]);
      const historicalMonthRate = model.districtMonthBaseRate[district.name]?.[month] ?? null;

      results.push({
        district: district.name,
        lat: district.lat,
        lng: district.lng,
        month,
        probability: Math.round(probability * 1000) / 1000,
        riskLevel: riskLevelFor(probability),
        basis: {
          projectedMonthRainfallMm: Math.round(projectedTotalMm),
          rainfallSoFarMm: Math.round(soFarMm),
          daysObservedThisMonth: countedDays,
          usedFallbackRate,
          prior30dRainfallMm: Math.round(prior30dMm),
          historicalMonthFloodRate: historicalMonthRate,
        },
      });
    } catch (err) {
      results.push({ district: district.name, month, error: true, message: err.message });
    }
  }
  return results;
}

function isModelAvailable() {
  return !!model;
}

function getModelMeta() {
  if (!model) return null;
  return {
    trainedAt: model.trainedAt,
    trainingWindow: model.trainingWindow,
    sampleCount: model.sampleCount,
    positiveCount: model.positiveCount,
    inSampleAccuracy: model.inSampleAccuracy,
    topDecilePrecision: model.topDecilePrecision,
    baseRate: model.baseRate,
    sources: model.sources,
  };
}

module.exports = {
  predictAllDistricts,
  isModelAvailable,
  getModelMeta,
  reloadModel,
  // Pure, network-free helpers — exported for unit testing only, no change
  // in behavior for the rest of this module.
  riskLevelFor,
  sigmoid,
  currentMonthProjectedTotal,
  recentAverageDailyRate,
  prior30dTotal,
};
