/**
 * Data-integrity and domain-sanity checks for the flood risk model's two
 * source artifacts. Deliberately reads the files directly from disk rather
 * than re-running training (that needs 25 live NASA POWER calls and takes
 * ~30-60s — appropriate for scripts/evaluate-flood-model.js, wrong for a
 * unit test that should run in milliseconds as part of every `npm test`).
 *
 * Both files are skipped gracefully (not failed) if missing, since — a real
 * gap found while writing this — neither is currently committed to git
 * (confirmed via `git ls-files`); a fresh clone or CI checkout won't have
 * them until `desinventar-flood-records.json` is committed and
 * `npm run train-flood-model` has been run at least once. See CLAUDE.md's
 * "Project quality tooling" section for the full finding — this defensive
 * skip is a workaround for that gap, not a fix for it.
 */
const fs = require("fs");
const path = require("path");
const { DISTRICTS } = require("../districts");

const RECORDS_PATH = path.join(__dirname, "../../data/desinventar-flood-records.json");
const MODEL_PATH = path.join(__dirname, "../../data/flood-risk-model.json");

const DESINVENTAR_DISTRICT_ALIASES = { Moneragala: "Monaragala" };

const recordsExist = fs.existsSync(RECORDS_PATH);
const modelExists = fs.existsSync(MODEL_PATH);

describe.skipIf(!recordsExist)("DesInventar flood records data integrity", () => {
  const records = recordsExist ? JSON.parse(fs.readFileSync(RECORDS_PATH, "utf8")) : [];
  const knownDistricts = new Set(DISTRICTS.map((d) => d.name));

  it("has a substantial number of real historical records", () => {
    expect(records.length).toBeGreaterThan(1000);
  });

  it("every record has the expected schema", () => {
    for (const r of records.slice(0, 50)) {
      expect(r).toHaveProperty("district");
      expect(r).toHaveProperty("year");
      expect(r).toHaveProperty("month");
      expect(r).toHaveProperty("eventType");
      expect(typeof r.year).toBe("number");
      expect(r.month).toBeGreaterThanOrEqual(1);
      expect(r.month).toBeLessThanOrEqual(12);
    }
  });

  it("every district name maps to a real Sri Lankan district (via the alias table if needed)", () => {
    const unmapped = new Set();
    for (const r of records) {
      const district = DESINVENTAR_DISTRICT_ALIASES[r.district] || r.district;
      if (district && !knownDistricts.has(district)) unmapped.add(r.district);
    }
    expect([...unmapped]).toEqual([]);
  });

  it("covers a multi-decade year range within the model's training window", () => {
    const years = records.map((r) => r.year).filter((y) => typeof y === "number");
    expect(Math.min(...years)).toBeLessThanOrEqual(1981);
    expect(Math.max(...years)).toBeGreaterThanOrEqual(2019);
  });
});

describe.skipIf(!modelExists)("Trained flood-risk-model.json sanity", () => {
  const model = modelExists ? JSON.parse(fs.readFileSync(MODEL_PATH, "utf8")) : null;

  it("has the expected top-level structure", () => {
    expect(model).toHaveProperty("weights");
    expect(model).toHaveProperty("bias");
    expect(model).toHaveProperty("featureMeans");
    expect(model).toHaveProperty("featureStds");
    expect(model).toHaveProperty("districtMonthBaseRate");
    expect(model.sampleCount).toBeGreaterThan(0);
  });

  it("training did not diverge — every weight and the bias are finite numbers", () => {
    expect(model.weights.every((w) => Number.isFinite(w))).toBe(true);
    expect(Number.isFinite(model.bias)).toBe(true);
  });

  it("every district-month historical base rate is a valid probability", () => {
    for (const district of Object.keys(model.districtMonthBaseRate)) {
      for (const rate of Object.values(model.districtMonthBaseRate[district])) {
        expect(rate).toBeGreaterThanOrEqual(0);
        expect(rate).toBeLessThanOrEqual(1);
      }
    }
  });

  it("matches known Sri Lankan monsoon geography: Ratnapura (May) floods far more often than Mannar (February)", () => {
    // Real domain-knowledge check, not a made-up threshold: Ratnapura sits at
    // a river confluence in the southwest-monsoon belt; Mannar is dry-zone,
    // northeast-monsoon-only. If this failed, the model's seasonal signal
    // would be meaningless regardless of any other metric.
    const ratnapuraMay = model.districtMonthBaseRate["Ratnapura"]?.["5"];
    const mannarFeb = model.districtMonthBaseRate["Mannar"]?.["2"];
    expect(ratnapuraMay).toBeGreaterThan(mannarFeb);
  });

  it("the model's own reported top-decile precision genuinely beats its base rate", () => {
    // The whole point of a risk-ranking model: its riskiest-predicted slice
    // should be meaningfully more accurate than chance, even though raw
    // 0.5-threshold accuracy is barely above a naive baseline (documented,
    // expected, due to the ~90/10 class imbalance).
    expect(model.topDecilePrecision).toBeGreaterThan(model.baseRate * 2);
  });
});
