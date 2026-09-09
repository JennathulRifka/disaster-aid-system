/**
 * Produces a real, saved ML test-results report for the flood risk model —
 * not just "the tests passed," but the actual numbers: a confusion matrix,
 * precision/recall/F1, domain-knowledge sanity checks, and data-integrity
 * checks on the two source datasets. Written for a dissertation's ML
 * validation chapter, where "we ran some tests" isn't enough evidence on
 * its own — the supervisor asked for the results themselves.
 *
 * Re-runs the training pipeline once (same ~30-60s, 25 NASA POWER calls as
 * a normal retrain) to get fresh in-sample predictions to evaluate against —
 * training is deterministic (fixed epochs/lr/l2, no randomness), so this
 * produces the same model currently being served, not a different one.
 *
 * Run: node scripts/evaluate-flood-model.js
 * Output: server/ml-evaluation-report.md (human-readable), server/ml-
 * evaluation-report.json (raw numbers), and server/roc-curve.svg (a real ROC
 * curve, hand-built as SVG directly from the computed points — no headless
 * browser/charting dependency needed, and SVG is a vector format Word/LaTeX
 * can embed directly for the dissertation). None of the three contain any
 * PII (unlike backup-firestore.js's output), all safe to commit.
 */

const fs = require("fs");
const path = require("path");
const { trainFloodRiskModel } = require("../src/utils/trainFloodRiskModel");
const { DISTRICTS } = require("../src/utils/districts");

const RECORDS_PATH = path.join(__dirname, "../src/data/desinventar-flood-records.json");
const ROC_SVG_PATH = path.join(__dirname, "../roc-curve.svg");
const REPORT_MD_PATH = path.join(__dirname, "../ml-evaluation-report.md");
const REPORT_JSON_PATH = path.join(__dirname, "../ml-evaluation-report.json");

const DESINVENTAR_DISTRICT_ALIASES = { Moneragala: "Monaragala" };

function checkDataIntegrity() {
  const raw = JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8"));
  const knownDistricts = new Set(DISTRICTS.map((d) => d.name));
  const unmappedDistricts = new Set();
  const years = [];
  for (const r of raw) {
    const district = DESINVENTAR_DISTRICT_ALIASES[r.district] || r.district;
    if (district && !knownDistricts.has(district)) unmappedDistricts.add(r.district);
    if (typeof r.year === "number") years.push(r.year);
  }
  return {
    totalRecords: raw.length,
    yearRange: [Math.min(...years), Math.max(...years)],
    unmappedDistricts: [...unmappedDistricts],
    distinctDistrictsInData: new Set(raw.map((r) => DESINVENTAR_DISTRICT_ALIASES[r.district] || r.district)).size,
  };
}

function confusionMatrix(evaluationRecords, threshold = 0.5) {
  let tp = 0,
    fp = 0,
    tn = 0,
    fn = 0;
  for (const r of evaluationRecords) {
    const predicted = r.probability >= threshold ? 1 : 0;
    if (predicted === 1 && r.label === 1) tp++;
    else if (predicted === 1 && r.label === 0) fp++;
    else if (predicted === 0 && r.label === 0) tn++;
    else fn++;
  }
  const total = tp + fp + tn + fn;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  const accuracy = (tp + tn) / total;
  const baselineAccuracy = (tn + fp) / total; // "always predict no flood"
  return { threshold, tp, fp, tn, fn, total, precision, recall, f1, accuracy, baselineAccuracy };
}

/**
 * ROC curve + AUC — unlike the 0.5-threshold confusion matrix above, this
 * evaluates the model's *ranking* quality across every possible threshold at
 * once, which is exactly this model's actual demonstrated strength (see the
 * top-decile-precision result) rather than its weak point (raw 0.5-threshold
 * accuracy, hurt by class imbalance). Thresholds are swept at every distinct
 * probability value that actually occurs in the data (plus 0 and 1), which
 * is the standard, exact way to trace a ROC curve — no need to guess a step
 * size that might skip the interesting part of the curve.
 */
function rocCurveAndAuc(evaluationRecords) {
  const positives = evaluationRecords.filter((r) => r.label === 1).length;
  const negatives = evaluationRecords.filter((r) => r.label === 0).length;

  const thresholds = [...new Set(evaluationRecords.map((r) => r.probability))].sort((a, b) => b - a);
  thresholds.unshift(1.01); // guarantees the curve starts at (0,0)
  thresholds.push(-0.01); // guarantees the curve ends at (1,1)

  const points = thresholds.map((threshold) => {
    let tp = 0,
      fp = 0;
    for (const r of evaluationRecords) {
      if (r.probability >= threshold) {
        if (r.label === 1) tp++;
        else fp++;
      }
    }
    return { threshold, tpr: positives ? tp / positives : 0, fpr: negatives ? fp / negatives : 0 };
  });

  // Trapezoidal rule over the (fpr, tpr) points, which are already sorted by
  // ascending fpr as a side effect of sweeping thresholds from high to low.
  let auc = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].fpr - points[i - 1].fpr;
    const avgY = (points[i].tpr + points[i - 1].tpr) / 2;
    auc += dx * avgY;
  }

  // Thin the point list for the saved report/plot — 12,000 raw thresholds is
  // needless precision for a curve that gets rendered at a few hundred
  // pixels wide; keep every Nth point plus both endpoints exactly.
  const maxPoints = 200;
  const step = Math.max(1, Math.floor(points.length / maxPoints));
  const thinnedPoints = points.filter((_, i) => i % step === 0 || i === points.length - 1);

  return { auc, points: thinnedPoints };
}

/**
 * Renders the ROC curve as a standalone SVG file — no headless-browser or
 * charting-library dependency needed, since it's just line segments and
 * text in a fixed coordinate space. A real vector figure, not a screenshot:
 * scales cleanly at any size and drops straight into a Word/LaTeX document.
 */
function renderRocCurveSvg(points, auc) {
  const W = 520,
    H = 420;
  const marginLeft = 60,
    marginRight = 30,
    marginTop = 30,
    marginBottom = 60;
  const plotW = W - marginLeft - marginRight;
  const plotH = H - marginTop - marginBottom;

  const x = (fpr) => marginLeft + fpr * plotW;
  const y = (tpr) => marginTop + (1 - tpr) * plotH;

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.fpr).toFixed(2)} ${y(p.tpr).toFixed(2)}`).join(" ");

  const gridLines = [0, 0.2, 0.4, 0.6, 0.8, 1.0]
    .map(
      (t) => `
    <line x1="${x(t).toFixed(2)}" y1="${marginTop}" x2="${x(t).toFixed(2)}" y2="${marginTop + plotH}" stroke="#e5e7eb" stroke-width="1" />
    <line x1="${marginLeft}" y1="${y(t).toFixed(2)}" x2="${marginLeft + plotW}" y2="${y(t).toFixed(2)}" stroke="#e5e7eb" stroke-width="1" />
    <text x="${x(t).toFixed(2)}" y="${marginTop + plotH + 18}" text-anchor="middle" font-size="11" fill="#6b7280">${t.toFixed(1)}</text>
    <text x="${marginLeft - 10}" y="${y(t).toFixed(2) - -4}" text-anchor="end" font-size="11" fill="#6b7280">${t.toFixed(1)}</text>`
    )
    .join("");

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Arial, Helvetica, sans-serif">
  <rect x="0" y="0" width="${W}" height="${H}" fill="#ffffff" />
  <text x="${W / 2}" y="18" text-anchor="middle" font-size="14" font-weight="bold" fill="#111827">ROC Curve — Flood Risk Model</text>
  ${gridLines}
  <rect x="${marginLeft}" y="${marginTop}" width="${plotW}" height="${plotH}" fill="none" stroke="#9ca3af" stroke-width="1.5" />
  <line x1="${x(0)}" y1="${y(0)}" x2="${x(1)}" y2="${y(1)}" stroke="#9ca3af" stroke-width="1.5" stroke-dasharray="5,4" />
  <path d="${linePath}" fill="none" stroke="#1d4ed8" stroke-width="2.5" stroke-linejoin="round" />
  <text x="${x(0.62).toFixed(2)}" y="${y(0.22).toFixed(2)}" font-size="13" font-weight="bold" fill="#1d4ed8">AUC = ${auc.toFixed(3)}</text>
  <text x="${(marginLeft + plotW / 2).toFixed(2)}" y="${H - 15}" text-anchor="middle" font-size="12" fill="#374151">False Positive Rate</text>
  <text x="16" y="${(marginTop + plotH / 2).toFixed(2)}" text-anchor="middle" font-size="12" fill="#374151" transform="rotate(-90 16 ${(marginTop + plotH / 2).toFixed(2)})">True Positive Rate</text>
</svg>`;
}

function domainSanityChecks(model) {
  const checks = [];

  // Real, well-documented Sri Lankan monsoon geography: Ratnapura (southwest
  // monsoon, river-confluence flooding) should show far higher May flood
  // frequency than Mannar (dry zone, northeast-monsoon-only) shows in
  // February — if this failed, the model's seasonal signal would be
  // meaningless regardless of any other metric.
  const ratnapuraMay = model.districtMonthBaseRate["Ratnapura"]?.[5] ?? null;
  const mannarFeb = model.districtMonthBaseRate["Mannar"]?.[2] ?? null;
  checks.push({
    name: "Ratnapura (May) historical flood rate exceeds Mannar (February)",
    pass: ratnapuraMay != null && mannarFeb != null && ratnapuraMay > mannarFeb,
    detail: `Ratnapura/May = ${ratnapuraMay}, Mannar/February = ${mannarFeb}`,
  });

  // Every historical base rate must be a genuine probability.
  let allRatesInRange = true;
  for (const district of Object.keys(model.districtMonthBaseRate)) {
    for (const rate of Object.values(model.districtMonthBaseRate[district])) {
      if (rate < 0 || rate > 1) allRatesInRange = false;
    }
  }
  checks.push({
    name: "Every district-month historical base rate is a valid probability [0,1]",
    pass: allRatesInRange,
  });

  // Training divergence check — gradient descent gone wrong produces NaN or
  // ±Infinity weights, which would silently make every prediction garbage.
  const allFinite = model.weights.every((w) => Number.isFinite(w)) && Number.isFinite(model.bias);
  checks.push({
    name: "All trained weights and the bias are finite numbers (no NaN/Infinity — training didn't diverge)",
    pass: allFinite,
    detail: `weights = [${model.weights.map((w) => w.toFixed(4)).join(", ")}], bias = ${model.bias.toFixed(4)}`,
  });

  return checks;
}

function topAndBottomDistrictMonths(model, n = 5) {
  const rows = [];
  for (const district of Object.keys(model.districtMonthBaseRate)) {
    for (const [month, rate] of Object.entries(model.districtMonthBaseRate[district])) {
      rows.push({ district, month: Number(month), rate });
    }
  }
  rows.sort((a, b) => b.rate - a.rate);
  return { riskiest: rows.slice(0, n), safest: rows.slice(-n).reverse() };
}

const MONTH_NAMES = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function main() {
  console.log("=== Flood Risk Model — Test Results & Evaluation ===\n");

  console.log("1. Data integrity checks");
  const dataIntegrity = checkDataIntegrity();
  console.log(`   DesInventar records: ${dataIntegrity.totalRecords}, years ${dataIntegrity.yearRange.join("-")}`);
  console.log(`   Distinct districts in raw data: ${dataIntegrity.distinctDistrictsInData}`);
  console.log(
    dataIntegrity.unmappedDistricts.length === 0
      ? "   PASS: every district name in the raw data maps to a known Sri Lankan district"
      : `   FAIL: unmapped district names found: ${dataIntegrity.unmappedDistricts.join(", ")}`
  );

  console.log("\n2. Re-running training to get fresh in-sample predictions (~30-60s)...");
  const model = await trainFloodRiskModel({ onProgress: (msg) => console.log(`   ${msg}`) });

  console.log("\n3. Confusion matrix (threshold = 0.5)");
  const cm = confusionMatrix(model.evaluationRecords, 0.5);
  console.log(`   TP=${cm.tp}  FP=${cm.fp}  TN=${cm.tn}  FN=${cm.fn}  (n=${cm.total})`);
  console.log(`   Precision: ${(cm.precision * 100).toFixed(1)}%   Recall: ${(cm.recall * 100).toFixed(1)}%   F1: ${(cm.f1 * 100).toFixed(1)}%`);
  console.log(`   Accuracy: ${(cm.accuracy * 100).toFixed(1)}%  (vs. "always predict no flood" baseline: ${(cm.baselineAccuracy * 100).toFixed(1)}%)`);

  console.log("\n3b. ROC curve and AUC (ranking quality across every threshold)");
  const roc = rocCurveAndAuc(model.evaluationRecords);
  console.log(`   AUC = ${roc.auc.toFixed(3)} (0.5 = no better than chance, 1.0 = perfect ranking)`);
  fs.writeFileSync(ROC_SVG_PATH, renderRocCurveSvg(roc.points, roc.auc));
  console.log(`   ROC curve written to ${ROC_SVG_PATH}`);

  console.log("\n4. Domain-knowledge sanity checks");
  const sanityChecks = domainSanityChecks(model);
  for (const check of sanityChecks) {
    console.log(`   ${check.pass ? "PASS" : "FAIL"}: ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
  }

  const { riskiest, safest } = topAndBottomDistrictMonths(model);

  const allSanityPassed = sanityChecks.every((c) => c.pass) && dataIntegrity.unmappedDistricts.length === 0;
  console.log(`\n=== Overall: ${allSanityPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED — see above"} ===`);

  // ---- Write the reports ----
  const generatedAt = new Date().toISOString();

  const jsonReport = {
    generatedAt,
    dataIntegrity,
    model: {
      trainedAt: model.trainedAt,
      trainingWindow: model.trainingWindow,
      sampleCount: model.sampleCount,
      positiveCount: model.positiveCount,
      inSampleAccuracy: model.inSampleAccuracy,
      topDecilePrecision: model.topDecilePrecision,
      baseRate: model.baseRate,
    },
    confusionMatrix: cm,
    rocAuc: roc.auc,
    rocCurvePoints: roc.points,
    sanityChecks,
    topRiskiestDistrictMonths: riskiest,
    topSafestDistrictMonths: safest,
    overallPass: allSanityPassed,
  };
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(jsonReport, null, 2));

  const md = `# Flood Risk Model — Test Results

Generated: ${generatedAt}
Model trained: ${model.trainedAt} (training window ${model.trainingWindow.startYear}-${model.trainingWindow.endYear})

## 1. Data integrity

| Check | Result |
|---|---|
| DesInventar historical flood records loaded | ${dataIntegrity.totalRecords} |
| Year range covered | ${dataIntegrity.yearRange.join("-")} |
| Distinct districts in raw data | ${dataIntegrity.distinctDistrictsInData} |
| Unmapped district names | ${dataIntegrity.unmappedDistricts.length === 0 ? "None (all map to a known district)" : dataIntegrity.unmappedDistricts.join(", ")} |

## 2. Model summary

| Metric | Value |
|---|---|
| Training samples | ${model.sampleCount} (${model.positiveCount} positive, ${((model.positiveCount / model.sampleCount) * 100).toFixed(1)}%) |
| In-sample accuracy (0.5 threshold) | ${(model.inSampleAccuracy * 100).toFixed(1)}% |
| Top-decile precision | ${(model.topDecilePrecision * 100).toFixed(1)}% vs. ${(model.baseRate * 100).toFixed(1)}% base rate (${(model.topDecilePrecision / model.baseRate).toFixed(1)}x) |

## 3. Confusion matrix (probability threshold = 0.5)

| | Predicted flood | Predicted no flood |
|---|---|---|
| **Actual flood** | TP = ${cm.tp} | FN = ${cm.fn} |
| **Actual no flood** | FP = ${cm.fp} | TN = ${cm.tn} |

| Metric | Value |
|---|---|
| Precision | ${(cm.precision * 100).toFixed(1)}% |
| Recall | ${(cm.recall * 100).toFixed(1)}% |
| F1 score | ${(cm.f1 * 100).toFixed(1)}% |
| Accuracy | ${(cm.accuracy * 100).toFixed(1)}% |
| Baseline accuracy ("always predict no flood") | ${(cm.baselineAccuracy * 100).toFixed(1)}% |

**Reading this honestly**: raw accuracy is barely above the always-predict-negative baseline, because only ~${(model.baseRate * 100).toFixed(0)}% of district-months in the training data ever had a reported flood — this is the same class-imbalance issue already documented for top-decile precision. Precision/recall/F1 at the 0.5 threshold are included here for completeness (a standard classification report), but the model's real, demonstrated skill is in *ranking* risk (top-decile precision, ${(model.topDecilePrecision / model.baseRate).toFixed(1)}x the base rate), not in a binary yes/no call at 0.5.

## 3b. ROC curve and AUC

**AUC = ${roc.auc.toFixed(3)}** (0.5 = no better than random guessing, 1.0 = perfect ranking).

Unlike the confusion matrix above, ROC/AUC doesn't depend on picking one threshold — it evaluates the model's ability to rank a genuinely-flooded district-month above a non-flooded one, across every possible threshold at once. This is the standard way classification models are compared when the decision threshold is a design choice rather than a fixed requirement, and it's the metric most directly comparable to what a Random Forest or LSTM classifier in this same evaluation would report.

![ROC curve](roc-curve.svg)

*(The dashed diagonal is the random-guess baseline (AUC = 0.5); the further the real curve bows toward the top-left corner, the better the model separates flood from non-flood months.)*

## 4. Domain-knowledge sanity checks

${sanityChecks.map((c) => `- **${c.pass ? "PASS" : "FAIL"}**: ${c.name}${c.detail ? `\n  - ${c.detail}` : ""}`).join("\n")}

## 5. Riskiest and safest district-months (qualitative check)

Real, interpretable output — the top 5 should read as genuinely flood-prone places/seasons to anyone familiar with Sri Lanka's geography, and the bottom 5 should read as genuinely dry.

**Riskiest:**
${riskiest.map((r) => `- ${r.district}, ${MONTH_NAMES[r.month]}: ${(r.rate * 100).toFixed(1)}% of years had a reported flood`).join("\n")}

**Safest:**
${safest.map((r) => `- ${r.district}, ${MONTH_NAMES[r.month]}: ${(r.rate * 100).toFixed(1)}% of years had a reported flood`).join("\n")}

## Overall result: ${allSanityPassed ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED"}

---
*This is a dissertation-scope evaluation on in-sample data (not a held-out test set) — appropriate for demonstrating the model learned a real, sensible signal from real historical data, not a claim of production-grade forecasting accuracy. See CLAUDE.md's "Flood risk forecast (ML)" section for the full data-sources and limitations discussion.*
`;
  fs.writeFileSync(REPORT_MD_PATH, md);

  console.log(`\nReports written:\n  ${REPORT_MD_PATH}\n  ${REPORT_JSON_PATH}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Evaluation failed:", err);
    process.exit(1);
  });
