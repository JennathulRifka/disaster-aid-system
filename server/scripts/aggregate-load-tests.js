/**
 * Aggregates every run saved by load-test.js (server/load-test-runs.json)
 * into one report: per phase, the mean and run-to-run standard deviation of
 * p50 / p95 / p99 latency, plus total success rate and the double-match
 * count — the variance/error-bar evidence a single run can't give.
 *
 * Usage (from the server folder, after running load-test.js a few times):
 *     node scripts/aggregate-load-tests.js
 * Writes load-test-report.md and load-test-report.json next to package.json.
 */
const fs = require("fs");
const path = require("path");

// "node scripts/aggregate-load-tests.js"         -> local runs    (load-test-runs.json -> load-test-report.*)
// "node scripts/aggregate-load-tests.js vercel"  -> deployed runs (load-test-runs-vercel.json -> load-test-report-vercel.*)
const SUFFIX = process.argv[2] === "vercel" ? "-vercel" : "";
const runsFile = path.join(__dirname, `../load-test-runs${SUFFIX}.json`);
if (!fs.existsSync(runsFile)) {
  console.error("No load-test-runs.json yet — run `node load-test.js` first.");
  process.exit(1);
}
const runs = JSON.parse(fs.readFileSync(runsFile, "utf8"));

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const sd = (a) => {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1));
};
const r = (n) => Math.round(n);

const phaseNames = [...new Set(runs.flatMap((run) => run.phases.map((p) => p.phase)))];
const rows = phaseNames.map((name) => {
  const per = runs.map((run) => run.phases.find((p) => p.phase === name)).filter(Boolean);
  const total = per.reduce((x, p) => x + p.total, 0);
  const ok = per.reduce((x, p) => x + p.succeeded, 0);
  const col = (k) => per.map((p) => p[k]);
  return {
    phase: name,
    runs: per.length,
    requests: total,
    successRate: total ? ok / total : 0,
    p50: { mean: r(mean(col("p50Ms"))), sd: r(sd(col("p50Ms"))) },
    p95: { mean: r(mean(col("p95Ms"))), sd: r(sd(col("p95Ms"))) },
    p99: { mean: r(mean(col("p99Ms"))), sd: r(sd(col("p99Ms"))) },
    max: r(Math.max(...col("maxMs"))),
  };
});

const doubleMatched = runs.reduce((x, run) => x + (run.doubleMatchedItems || 0), 0);
const report = { runCount: runs.length, doubleMatchedItemsTotal: doubleMatched, phases: rows };
fs.writeFileSync(path.join(__dirname, `../load-test-report${SUFFIX}.json`), JSON.stringify(report, null, 2));

const cell = (o) => `${o.mean} ± ${o.sd}`;
let md = `# Concurrent load test ${SUFFIX ? "(deployed Vercel site)" : "(local server)"}: aggregate over ${runs.length} run(s)\n\n`;
md += `Each run creates 30 victims, 30 donors, 15 volunteers and 1 admin (real throwaway accounts), then fires each phase's requests at the same instant against the real Express + Firestore backend. Latencies are successful requests only, in milliseconds. "mean ± sd" is the mean and standard deviation of that statistic **across runs** (run-to-run variance); with n = ${runs.length} run(s) treat the sd as indicative, not a confidence interval.\n\n`;
md += `| Phase | Requests | Success | p50 (ms) | p95 (ms) | p99 (ms) | Worst (ms) |\n|---|---|---|---|---|---|---|\n`;
for (const x of rows) {
  md += `| ${x.phase} | ${x.requests} | ${(x.successRate * 100).toFixed(1)}% | ${cell(x.p50)} | ${cell(x.p95)} | ${cell(x.p99)} | ${x.max} |\n`;
}
md += `\nDouble-matched request items across all runs: **${doubleMatched}** (race-condition probe, Phase 3; matching now runs inside a Firestore transaction).\n`;
md += `\nCaveats: the 'Read burst' phase mixes three cached endpoints, so its tail reflects cache misses on a cold serverless-style start rather than steady-state latency. Run-to-run spread is also affected by Firebase Auth/Firestore rate limiting when runs are launched back to back (each run creates and deletes 76 accounts); the runs were spaced apart for this reason.\n`;
fs.writeFileSync(path.join(__dirname, `../load-test-report${SUFFIX}.md`), md);
console.log(md);
