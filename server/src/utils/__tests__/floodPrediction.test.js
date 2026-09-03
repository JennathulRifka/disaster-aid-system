const {
  riskLevelFor,
  sigmoid,
  currentMonthProjectedTotal,
  recentAverageDailyRate,
  prior30dTotal,
} = require("../floodPrediction");

function dateKey(d) {
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
}

describe("riskLevelFor", () => {
  it("buckets probabilities into the 4 documented risk levels", () => {
    expect(riskLevelFor(0)).toBe("low");
    expect(riskLevelFor(0.15)).toBe("low");
    expect(riskLevelFor(0.16)).toBe("moderate");
    expect(riskLevelFor(0.3)).toBe("moderate");
    expect(riskLevelFor(0.31)).toBe("elevated");
    expect(riskLevelFor(0.5)).toBe("elevated");
    expect(riskLevelFor(0.51)).toBe("high");
    expect(riskLevelFor(1)).toBe("high");
  });
});

describe("sigmoid", () => {
  it("returns exactly 0.5 at z=0", () => {
    expect(sigmoid(0)).toBe(0.5);
  });

  it("approaches 1 for large positive z and 0 for large negative z", () => {
    expect(sigmoid(20)).toBeGreaterThan(0.999);
    expect(sigmoid(-20)).toBeLessThan(0.001);
  });
});

describe("currentMonthProjectedTotal", () => {
  const now = new Date(Date.UTC(2026, 8, 10)); // Sept 10, 2026 — September has 30 days

  it("projects a full-month total from the days observed so far", () => {
    const dailySeries = {};
    for (let day = 1; day <= 10; day++) {
      dailySeries[dateKey(new Date(Date.UTC(2026, 8, day)))] = 10; // 10mm/day for 10 days
    }
    const result = currentMonthProjectedTotal(dailySeries, now, 0);
    expect(result.soFarMm).toBe(100);
    expect(result.countedDays).toBe(10);
    expect(result.usedFallbackRate).toBe(false);
    // (100mm / 10 days) * 30 days in September = 300mm
    expect(result.projectedTotalMm).toBeCloseTo(300, 5);
  });

  it("skips -999 (missing) days rather than counting them as zero rainfall", () => {
    const dailySeries = {
      [dateKey(new Date(Date.UTC(2026, 8, 1)))]: 20,
      [dateKey(new Date(Date.UTC(2026, 8, 2)))]: -999,
    };
    const now2 = new Date(Date.UTC(2026, 8, 2));
    const result = currentMonthProjectedTotal(dailySeries, now2, 0);
    expect(result.countedDays).toBe(1);
    expect(result.soFarMm).toBe(20);
  });

  it("falls back to the recent average rate when zero days are observed yet", () => {
    // Real scenario this guards: NASA POWER's ~2-3 day publishing lag means
    // the first days of a month can have no data at all yet.
    const result = currentMonthProjectedTotal({}, now, 5);
    expect(result.countedDays).toBe(0);
    expect(result.usedFallbackRate).toBe(true);
    expect(result.soFarMm).toBe(0);
    // 5mm/day fallback rate * 30 days in September = 150mm
    expect(result.projectedTotalMm).toBe(150);
  });
});

describe("recentAverageDailyRate", () => {
  it("averages the most recent N fully-reported days ending at 'now'", () => {
    const now = new Date(Date.UTC(2026, 8, 10));
    const dailySeries = {};
    for (let i = 0; i < 10; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      dailySeries[dateKey(d)] = 5; // flat 5mm/day for the last 10 days
    }
    expect(recentAverageDailyRate(dailySeries, now, 10)).toBeCloseTo(5, 5);
  });

  it("returns 0 when no valid days are found at all", () => {
    const now = new Date(Date.UTC(2026, 8, 10));
    expect(recentAverageDailyRate({}, now, 10)).toBe(0);
  });
});

describe("prior30dTotal", () => {
  it("sums exactly the 30 days immediately before the given month start", () => {
    const monthStart = new Date(Date.UTC(2026, 8, 1)); // Sept 1, 2026
    const dailySeries = {};
    for (let i = 1; i <= 30; i++) {
      const d = new Date(monthStart);
      d.setUTCDate(d.getUTCDate() - i);
      dailySeries[dateKey(d)] = 2; // flat 2mm/day for the 30 days before Sept
    }
    expect(prior30dTotal(dailySeries, monthStart)).toBe(60);
  });

  it("ignores days on or after the month start", () => {
    const monthStart = new Date(Date.UTC(2026, 8, 1));
    const dailySeries = { [dateKey(monthStart)]: 999 }; // Sept 1 itself — should not be counted
    expect(prior30dTotal(dailySeries, monthStart)).toBe(0);
  });
});
