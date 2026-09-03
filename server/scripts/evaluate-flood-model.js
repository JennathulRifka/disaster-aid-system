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
 * Output: server/ml-evaluation-report.md (human-readable) and
 * server/ml-evaluation-report.json (raw numbers) — both safe to commit,
 * neither contains any PII (unlike backup-firestore.js's output).
 */

const fs = require("fs");
const path = require("path");
const { trainFloodRiskModel } = require("../src/utils/trainFloodRiskModel");
const { DISTRICTS } = require("../src/utils/districts");

const RECORDS_PATH = path.join(__dirname, "../src/data/desinventar-flood-records.json");
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
