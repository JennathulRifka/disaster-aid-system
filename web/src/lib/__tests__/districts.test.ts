import { describe, it, expect } from "vitest";
import { DISTRICTS, nearestDistrict } from "../districts";

describe("DISTRICTS (client mirror)", () => {
  it("has all 25 districts, matching the server's own list", () => {
    expect(DISTRICTS.length).toBe(25);
  });
});

describe("nearestDistrict", () => {
  it("matches a point exactly at a district's own centroid to that district", () => {
    const galle = DISTRICTS.find((d) => d.name === "Galle")!;
    expect(nearestDistrict({ lat: galle.lat, lng: galle.lng })).toBe("Galle");
  });

  it("returns null for a missing/undefined location rather than throwing", () => {
    expect(nearestDistrict(null)).toBeNull();
    expect(nearestDistrict(undefined)).toBeNull();
  });
});
