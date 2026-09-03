import { describe, it, expect } from "vitest";
import { normalizeSriLankanPhone } from "../phone";

// Same expected behavior as server/src/utils/__tests__/phone.test.js — this
// is a deliberate client-side mirror (Register.tsx validates before
// submitting), so both copies should agree exactly.
describe("normalizeSriLankanPhone (client mirror)", () => {
  it("normalizes common input formats to the same bare digit string", () => {
    expect(normalizeSriLankanPhone("0771234567")).toBe("94771234567");
    expect(normalizeSriLankanPhone("+94771234567")).toBe("94771234567");
    expect(normalizeSriLankanPhone("94771234567")).toBe("94771234567");
    expect(normalizeSriLankanPhone("771234567")).toBe("94771234567");
  });

  it("rejects landlines and garbage input", () => {
    expect(normalizeSriLankanPhone("0112345678")).toBeNull();
    expect(normalizeSriLankanPhone("12345")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(normalizeSriLankanPhone("")).toBeNull();
  });
});
