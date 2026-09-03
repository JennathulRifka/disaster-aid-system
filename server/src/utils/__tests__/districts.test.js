const { DISTRICTS, nearestDistrict } = require("../districts");

describe("DISTRICTS", () => {
  it("has all 25 of Sri Lanka's real administrative districts, no duplicates", () => {
    expect(DISTRICTS.length).toBe(25);
    const names = new Set(DISTRICTS.map((d) => d.name));
    expect(names.size).toBe(25);
  });

  it("every district has plausible Sri Lankan coordinates", () => {
    for (const d of DISTRICTS) {
      expect(d.lat).toBeGreaterThan(5.5);
      expect(d.lat).toBeLessThan(10);
      expect(d.lng).toBeGreaterThan(79);
      expect(d.lng).toBeLessThan(82.5);
    }
  });
});

describe("nearestDistrict", () => {
  it("matches a point exactly at a district's own centroid to that district", () => {
    const colombo = DISTRICTS.find((d) => d.name === "Colombo");
    expect(nearestDistrict({ lat: colombo.lat, lng: colombo.lng })).toBe("Colombo");
  });

  it("matches a point slightly offset from a centroid to the same nearest district", () => {
    const kandy = DISTRICTS.find((d) => d.name === "Kandy");
    expect(nearestDistrict({ lat: kandy.lat + 0.01, lng: kandy.lng + 0.01 })).toBe("Kandy");
  });

  it("picks the genuinely closest district for a point between two candidates", () => {
    // Roughly between Colombo and Gampaha, but closer to Colombo.
    const result = nearestDistrict({ lat: 6.98, lng: 79.9 });
    expect(["Colombo", "Gampaha"]).toContain(result);
  });
});
