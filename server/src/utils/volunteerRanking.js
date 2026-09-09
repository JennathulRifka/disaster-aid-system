/**
 * Pure ranking logic for automatic volunteer assignment — nearest by
 * straight-line distance, tie-broken by fewest active deliveries (the rule
 * confirmed with the user for autoAssignVolunteer.js). Extracted into its
 * own dependency-free module (no Firebase import) specifically so this
 * business rule is unit-testable without pulling in autoAssignVolunteer.js's
 * `require("../config/firebase")`, which initializes the Admin SDK at
 * module-load time and throws without real credentials — exactly what CI
 * must never need. No behavior change, just a relocation.
 */
const { distanceKm } = require("./geo");

/** Returns candidates sorted best-first (not just the winner), so a caller
 * can also inspect runner-ups if useful. */
function rankVolunteers(candidates, pickupLocation, activeCountByVolunteer) {
  return candidates
    .map((v) => ({
      volunteer: v,
      distanceKm: distanceKm(pickupLocation, v.location),
      activeCount: activeCountByVolunteer[v.uid] || 0,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.activeCount - b.activeCount);
}

module.exports = { rankVolunteers };
