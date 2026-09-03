const { normalizeSriLankanPhone } = require("../phone");

describe("normalizeSriLankanPhone", () => {
  it("normalizes a local-format number (leading 0)", () => {
    expect(normalizeSriLankanPhone("0771234567")).toBe("94771234567");
  });

  it("normalizes an already-international number with +", () => {
    expect(normalizeSriLankanPhone("+94771234567")).toBe("94771234567");
  });

  it("normalizes a bare international number with no +", () => {
    expect(normalizeSriLankanPhone("94771234567")).toBe("94771234567");
  });

  it("normalizes a 9-digit number with no leading 0 or country code", () => {
    expect(normalizeSriLankanPhone("771234567")).toBe("94771234567");
  });

  it("strips spaces and dashes before normalizing", () => {
    expect(normalizeSriLankanPhone("077-123 4567")).toBe("94771234567");
    expect(normalizeSriLankanPhone("+94 77 123 4567")).toBe("94771234567");
  });

  it("rejects landline numbers (011... etc, second digit isn't 7)", () => {
    expect(normalizeSriLankanPhone("0112345678")).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(normalizeSriLankanPhone("12345")).toBeNull();
    expect(normalizeSriLankanPhone("not a phone number")).toBeNull();
  });

  it("returns null for empty/falsy input rather than throwing", () => {
    expect(normalizeSriLankanPhone("")).toBeNull();
    expect(normalizeSriLankanPhone(null)).toBeNull();
    expect(normalizeSriLankanPhone(undefined)).toBeNull();
  });
});
