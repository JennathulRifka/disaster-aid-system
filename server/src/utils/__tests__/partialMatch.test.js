const { planMatch } = require("../partialMatch");

const waterItem = (quantity, extra = {}) => ({ category: "water", quantity, unit: "L", status: "pending", donationId: null, ...extra });

describe("planMatch — partial coverage no longer closes the whole item", () => {
  it("splits a 50 L item when the donation has only 20 L: 20 L matched, 30 L still pending", () => {
    const plan = planMatch([waterItem(50)], "water", 20, "don1");
    expect(plan.consumedQuantity).toBe(20);
    expect(plan.remainingAfter).toBe(0);
    expect(plan.outstandingQuantity).toBe(30);
    expect(plan.updatedItems).toHaveLength(2);
    expect(plan.updatedItems[0]).toMatchObject({ quantity: 20, status: "matched", donationId: "don1" });
    expect(plan.updatedItems[1]).toMatchObject({ quantity: 30, status: "pending", donationId: null });
  });

  it("the pending remainder can then be matched by a second donation, finishing the request item", () => {
    const first = planMatch([waterItem(50)], "water", 20, "don1");
    const second = planMatch(first.updatedItems, "water", 100, "don2");
    expect(second.consumedQuantity).toBe(30);
    expect(second.remainingAfter).toBe(70); // the second donation keeps its leftover
    expect(second.outstandingQuantity).toBe(0);
    const matched = second.updatedItems.filter((i) => i.status === "matched");
    expect(matched.map((i) => i.quantity)).toEqual([20, 30]);
    expect(second.updatedItems.some((i) => i.status === "pending")).toBe(false);
  });

  it("total requested quantity is conserved across the split (nothing disappears)", () => {
    const plan = planMatch([waterItem(50)], "water", 20, "don1");
    expect(plan.updatedItems.reduce((s, i) => s + i.quantity, 0)).toBe(50);
  });

  it("a donation larger than the need matches the item whole and keeps its leftover", () => {
    const plan = planMatch([waterItem(50)], "water", 80, "don1");
    expect(plan.consumedQuantity).toBe(50);
    expect(plan.remainingAfter).toBe(30);
    expect(plan.outstandingQuantity).toBe(0);
    expect(plan.updatedItems).toHaveLength(1);
    expect(plan.updatedItems[0]).toMatchObject({ quantity: 50, status: "matched", donationId: "don1" });
  });

  it("an exactly matching donation closes the item with no remainder and no leftover", () => {
    const plan = planMatch([waterItem(50)], "water", 50, "don1");
    expect(plan.outstandingQuantity).toBe(0);
    expect(plan.remainingAfter).toBe(0);
    expect(plan.updatedItems).toHaveLength(1);
  });

  it("a legacy donation with no tracked quantity (Infinity) is single-use and never persists Infinity", () => {
    const plan = planMatch([waterItem(50)], "water", Infinity, "don1");
    expect(plan.consumedQuantity).toBe(50);
    expect(plan.remainingAfter).toBe(0);
    expect(Number.isFinite(plan.remainingAfter)).toBe(true);
    expect(plan.outstandingQuantity).toBe(0);
  });

  it("only touches the first pending item of the donation's category and leaves other items alone", () => {
    const items = [{ category: "food", quantity: 5, status: "pending" }, waterItem(50), waterItem(10)];
    const plan = planMatch(items, "water", 20, "don1");
    expect(plan.updatedItems[0]).toEqual(items[0]);
    expect(plan.updatedItems.filter((i) => i.category === "water")).toHaveLength(3); // 50 split in two + the untouched 10
    expect(plan.updatedItems[plan.updatedItems.length - 1]).toEqual(items[2]);
  });

  it("returns null when the request has no pending item in that category", () => {
    expect(planMatch([waterItem(50, { status: "matched" })], "water", 20, "don1")).toBeNull();
    expect(planMatch([{ category: "food", quantity: 1, status: "pending" }], "water", 20, "don1")).toBeNull();
  });

  it("an item with no usable quantity (e.g. medicine's placeholder) is simply matched whole", () => {
    const items = [{ category: "medicine", quantity: 1, status: "pending" }];
    const plan = planMatch(items, "medicine", 5, "don1");
    expect(plan.outstandingQuantity).toBe(0);
    expect(plan.updatedItems[0]).toMatchObject({ status: "matched", donationId: "don1" });
  });
});
