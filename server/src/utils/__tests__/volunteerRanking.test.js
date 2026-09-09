const { rankVolunteers } = require("../volunteerRanking");

const PICKUP = { lat: 6.9271, lng: 79.8612 }; // Colombo

function volunteer(uid, location) {
  return { uid, location };
}

describe("rankVolunteers (automatic volunteer assignment)", () => {
  it("ranks the nearest volunteer first", () => {
    const near = volunteer("near", { lat: 6.93, lng: 79.86 }); // ~a few km from pickup
    const far = volunteer("far", { lat: 9.6615, lng: 80.0255 }); // Jaffna — far away
    const ranked = rankVolunteers([far, near], PICKUP, {});
    expect(ranked[0].volunteer.uid).toBe("near");
    expect(ranked[1].volunteer.uid).toBe("far");
  });

  it("tie-breaks equally-distant volunteers by fewest active deliveries", () => {
    // Two volunteers at the exact same location (identical distance) —
    // the one with fewer active deliveries should rank first.
    const busy = volunteer("busy", PICKUP);
    const idle = volunteer("idle", PICKUP);
    const activeCountByVolunteer = { busy: 3, idle: 0 };
    const ranked = rankVolunteers([busy, idle], PICKUP, activeCountByVolunteer);
    expect(ranked[0].volunteer.uid).toBe("idle");
    expect(ranked[1].volunteer.uid).toBe("busy");
  });

  it("distance always wins over workload — a slightly farther but idle volunteer still loses to a nearer busy one", () => {
    const nearButBusy = volunteer("nearBusy", { lat: 6.93, lng: 79.86 });
    const farButIdle = volunteer("farIdle", { lat: 9.6615, lng: 80.0255 });
    const activeCountByVolunteer = { nearBusy: 5, farIdle: 0 };
    const ranked = rankVolunteers([farButIdle, nearButBusy], PICKUP, activeCountByVolunteer);
    expect(ranked[0].volunteer.uid).toBe("nearBusy");
  });

  it("treats a volunteer with no active-delivery count on record as having zero (not undefined/NaN)", () => {
    const v = volunteer("newVolunteer", PICKUP);
    const ranked = rankVolunteers([v], PICKUP, {}); // no entry for "newVolunteer" at all
    expect(ranked[0].activeCount).toBe(0);
  });

  it("returns an empty array for no candidates, rather than throwing", () => {
    expect(rankVolunteers([], PICKUP, {})).toEqual([]);
  });

  it("computes a real, sane distance for each ranked candidate", () => {
    const v = volunteer("v1", { lat: 7.2906, lng: 80.6337 }); // Kandy
    const ranked = rankVolunteers([v], PICKUP, {});
    // Colombo -> Kandy is a well-known ~85-100km straight-line distance.
    expect(ranked[0].distanceKm).toBeGreaterThan(80);
    expect(ranked[0].distanceKm).toBeLessThan(100);
  });
});
