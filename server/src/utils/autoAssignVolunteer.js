const { db } = require("../config/firebase");
const { distanceKm } = require("./geo");

// Same "what counts as active" definition VolunteerWorkload.tsx already uses
// on the frontend — mirrored here so the tie-break reflects real current load.
const ACTIVE_DELIVERY_STATUSES = ["pending_acceptance", "accepted", "picked_up"];

/**
 * Picks the best volunteer to auto-assign to a donation pickup, or null if
 * none qualify. Rule (confirmed with the user): nearest available volunteer
 * by straight-line distance to the pickup location, tie-broken by whoever
 * currently has fewer active deliveries.
 *
 * A volunteer only qualifies if they're marked available (`available !==
 * false`, same backwards-compatible check used everywhere else) AND have a
 * location on file — volunteers who've never set one can't be distance-
 * ranked, so they're skipped here (they still show up in the manual
 * "Reassign volunteer" dropdown on AdminDonations.tsx, which isn't
 * distance-aware).
 */
async function findBestVolunteer(pickupLocation) {
  if (!pickupLocation) return null;

  const volunteersSnap = await db.collection("users").where("role", "==", "volunteer").get();
  const candidates = volunteersSnap.docs
    .map((doc) => doc.data())
    .filter((v) => v.available !== false && v.location);

  if (candidates.length === 0) return null;

  // Single "in" clause, filtered/counted in JS rather than a second Firestore
  // filter — avoids a composite-index dependency, same convention already
  // used elsewhere in this project (see "Internal case notes" in CLAUDE.md).
  const activeDeliveriesSnap = await db
    .collection("deliveries")
    .where("status", "in", ACTIVE_DELIVERY_STATUSES)
    .get();
  const activeCountByVolunteer = {};
  activeDeliveriesSnap.docs.forEach((doc) => {
    const volunteerId = doc.data().volunteerId;
    if (!volunteerId) return;
    activeCountByVolunteer[volunteerId] = (activeCountByVolunteer[volunteerId] || 0) + 1;
  });

  const ranked = candidates
    .map((v) => ({
      volunteer: v,
      distanceKm: distanceKm(pickupLocation, v.location),
      activeCount: activeCountByVolunteer[v.uid] || 0,
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm || a.activeCount - b.activeCount);

  return ranked[0].volunteer;
}

module.exports = { findBestVolunteer, ACTIVE_DELIVERY_STATUSES };
