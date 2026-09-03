const { distanceKm } = require("../geo");

describe("distanceKm", () => {
  it("returns 0 for identical points", () => {
    const p = { lat: 6.9271, lng: 79.8612 };
    expect(distanceKm(p, p)).toBeCloseTo(0, 5);
  });

  it("returns a real-world-accurate distance between two known cities", () => {
    // Colombo -> Kandy is a well-known ~90-95km straight-line distance.
    const colombo = { lat: 6.9271, lng: 79.8612 };
    const kandy = { lat: 7.2906, lng: 80.6337 };
    const d = distanceKm(colombo, kandy);
    expect(d).toBeGreaterThan(85);
    expect(d).toBeLessThan(100);
  });

  it("is symmetric regardless of argument order", () => {
    const a = { lat: 6.9271, lng: 79.8612 };
    const b = { lat: 9.6615, lng: 80.0255 };
    expect(distanceKm(a, b)).toBeCloseTo(distanceKm(b, a), 8);
  });

  it("returns Infinity when either point is missing", () => {
    const a = { lat: 6.9271, lng: 79.8612 };
    expect(distanceKm(a, null)).toBe(Infinity);
    expect(distanceKm(null, a)).toBe(Infinity);
    expect(distanceKm(null, null)).toBe(Infinity);
  });
});
