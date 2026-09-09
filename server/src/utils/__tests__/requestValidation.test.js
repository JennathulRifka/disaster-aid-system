const { normalizeAddress, normalizeNic, validateItems } = require("../requestValidation");

// A self-contained fixture matching categories.js's real DEFAULT_CATEGORY_LIMITS
// shape — deliberately not imported from categories.js itself, since that
// module requires ../config/firebase (Admin SDK init) at load time, which
// throws without real credentials; this test only needs realistic cap
// values, not the live/admin-editable ones.
const CATEGORY_LIMITS = {
  food: { label: "Food", max: 10, unit: "kg" },
  water: { label: "Water", max: 20, unit: "liters" },
  medicine: { label: "Medicine", max: null, unit: "packs" },
  clothing: { label: "Clothing", max: 15, unit: "items" },
  shelter: { label: "Shelter", max: 1, unit: "units" },
  baby_formula: { label: "Baby formula", max: 4, unit: "tins" },
  hygiene_kits: { label: "Hygiene kits", max: 5, unit: "kits" },
};

describe("normalizeAddress", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeAddress("  123 Main   Street, Colombo  ")).toBe("123 main street, colombo");
  });

  it("treats differently-cased/spaced versions of the same address as equal", () => {
    expect(normalizeAddress("123 Main St")).toBe(normalizeAddress("  123   MAIN st  "));
  });

  it("returns an empty string for null/undefined rather than throwing", () => {
    expect(normalizeAddress(null)).toBe("");
    expect(normalizeAddress(undefined)).toBe("");
  });
});

describe("normalizeNic", () => {
  it("uppercases and trims", () => {
    expect(normalizeNic("  982345678v  ")).toBe("982345678V");
  });

  it("treats differently-cased versions of the same NIC as equal", () => {
    expect(normalizeNic("982345678v")).toBe(normalizeNic("982345678V"));
  });

  it("returns an empty string for null/undefined rather than throwing", () => {
    expect(normalizeNic(null)).toBe("");
  });
});

describe("validateItems (category cap enforcement)", () => {
  

  it("rejects an empty or missing items array", () => {
    expect(validateItems([], CATEGORY_LIMITS)).toMatch(/at least one/i);
    expect(validateItems(null, CATEGORY_LIMITS)).toMatch(/at least one/i);
    expect(validateItems(undefined, CATEGORY_LIMITS)).toMatch(/at least one/i);
  });

  it("accepts a single valid item within its cap", () => {
    expect(validateItems([{ category: "food", quantity: 5 }], CATEGORY_LIMITS)).toBeNull();
  });

  it("rejects an unrecognized category", () => {
    expect(validateItems([{ category: "electronics", quantity: 1 }], CATEGORY_LIMITS)).toMatch(/not a recognized category/);
  });

  it("rejects the same category listed twice", () => {
    const items = [
      { category: "food", quantity: 2 },
      { category: "food", quantity: 3 },
    ];
    expect(validateItems(items, CATEGORY_LIMITS)).toMatch(/more than once/);
  });

  it("rejects a zero or negative quantity", () => {
    expect(validateItems([{ category: "water", quantity: 0 }], CATEGORY_LIMITS)).toMatch(/positive number/);
    expect(validateItems([{ category: "water", quantity: -5 }], CATEGORY_LIMITS)).toMatch(/positive number/);
  });

  it("rejects a non-numeric quantity", () => {
    expect(validateItems([{ category: "water", quantity: "a lot" }], CATEGORY_LIMITS)).toMatch(/positive number/);
  });

  it("enforces the real documented per-category caps (food: 10kg)", () => {
    expect(validateItems([{ category: "food", quantity: 10 }], CATEGORY_LIMITS)).toBeNull(); // exactly at cap: OK
    expect(validateItems([{ category: "food", quantity: 11 }], CATEGORY_LIMITS)).toMatch(/capped at 10/);
  });

  it("enforces the shelter cap of 1 unit", () => {
    expect(validateItems([{ category: "shelter", quantity: 1 }], CATEGORY_LIMITS)).toBeNull();
    expect(validateItems([{ category: "shelter", quantity: 2 }], CATEGORY_LIMITS)).toMatch(/capped at 1/);
  });

  it("never caps medicine — max: null means uncapped (flagged for admin review elsewhere instead)", () => {
    expect(validateItems([{ category: "medicine", quantity: 500 }], CATEGORY_LIMITS)).toBeNull();
  });

  it("accepts a valid multi-category request across several categories at once", () => {
    const items = [
      { category: "food", quantity: 5 },
      { category: "water", quantity: 10 },
      { category: "hygiene_kits", quantity: 2 },
    ];
    expect(validateItems(items, CATEGORY_LIMITS)).toBeNull();
  });

  it("catches a cap violation even when it's not the first item in a multi-item request", () => {
    const items = [
      { category: "food", quantity: 1 },
      { category: "baby_formula", quantity: 10 }, // cap is 4
    ];
    expect(validateItems(items, CATEGORY_LIMITS)).toMatch(/capped at 4/);
  });
});
