const { computeOverallStatus } = require("../requestItemStatus");

describe("computeOverallStatus", () => {
  it("is 'verified' when every item is still pending", () => {
    const items = [{ status: "pending" }, { status: "pending" }];
    expect(computeOverallStatus(items)).toBe("verified");
  });

  it("is 'in_progress' when at least one item has moved but not all delivered", () => {
    const items = [{ status: "matched" }, { status: "pending" }];
    expect(computeOverallStatus(items)).toBe("in_progress");
  });

  it("is 'in_progress' when some are delivered but not all", () => {
    const items = [{ status: "delivered" }, { status: "matched" }];
    expect(computeOverallStatus(items)).toBe("in_progress");
  });

  it("is 'delivered' only when every item is delivered", () => {
    const items = [{ status: "delivered" }, { status: "delivered" }];
    expect(computeOverallStatus(items)).toBe("delivered");
  });

  it("is 'delivered' for a single-item request that's delivered", () => {
    expect(computeOverallStatus([{ status: "delivered" }])).toBe("delivered");
  });
});
