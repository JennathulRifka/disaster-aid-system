const { calculatePriorityScore } = require("../priorityScore");

// createdAt "now" keeps waitScore ~0 so each test can isolate the criterion
// it's actually checking, rather than fighting a live Date.now() delta.
function baseRequest(overrides = {}) {
  return {
    severity: "low",
    peopleAffected: 0,
    vulnerableGroups: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("calculatePriorityScore", () => {
  it("weights severity levels correctly", () => {
    expect(calculatePriorityScore(baseRequest({ severity: "critical" })).breakdown.severityScore).toBe(40);
    expect(calculatePriorityScore(baseRequest({ severity: "high" })).breakdown.severityScore).toBe(30);
    expect(calculatePriorityScore(baseRequest({ severity: "medium" })).breakdown.severityScore).toBe(20);
    expect(calculatePriorityScore(baseRequest({ severity: "low" })).breakdown.severityScore).toBe(10);
  });

  it("defaults unknown/missing severity to the 'low' weight rather than 0", () => {
    expect(calculatePriorityScore(baseRequest({ severity: "made-up" })).breakdown.severityScore).toBe(10);
    expect(calculatePriorityScore(baseRequest({ severity: undefined })).breakdown.severityScore).toBe(10);
  });

  it("scores 2 points per person affected, capped at 30", () => {
    expect(calculatePriorityScore(baseRequest({ peopleAffected: 5 })).breakdown.affectedScore).toBe(10);
    expect(calculatePriorityScore(baseRequest({ peopleAffected: 100 })).breakdown.affectedScore).toBe(30);
  });

  it("scores 5 points per vulnerable group, capped at 25", () => {
    expect(calculatePriorityScore(baseRequest({ vulnerableGroups: ["elderly"] })).breakdown.vulnerableScore).toBe(5);
    expect(
      calculatePriorityScore(baseRequest({ vulnerableGroups: ["elderly", "children", "disabled", "pregnant", "infant", "sick"] }))
        .breakdown.vulnerableScore
    ).toBe(25);
  });

  it("treats a missing vulnerableGroups array as zero, not a crash", () => {
    const result = calculatePriorityScore(baseRequest({ vulnerableGroups: undefined }));
    expect(result.breakdown.vulnerableScore).toBe(0);
  });

  it("total is the sum of all four criteria, rounded to 2 decimals", () => {
    const result = calculatePriorityScore(
      baseRequest({ severity: "high", peopleAffected: 10, vulnerableGroups: ["elderly", "children"] })
    );
    // 30 (high) + 20 (10 people * 2) + 10 (2 groups * 5) + ~0 (just created) = ~60
    expect(result.total).toBeGreaterThanOrEqual(59.9);
    expect(result.total).toBeLessThan(61);
  });

  it("waitScore grows with elapsed time and caps at 20", () => {
    const freshResult = calculatePriorityScore(baseRequest());
    expect(freshResult.breakdown.waitScore).toBeCloseTo(0, 1);

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const oldResult = calculatePriorityScore(baseRequest({ createdAt: twentyFourHoursAgo }));
    // 24h * 1.5/h = 36, capped at 20
    expect(oldResult.breakdown.waitScore).toBe(20);
  });
});
