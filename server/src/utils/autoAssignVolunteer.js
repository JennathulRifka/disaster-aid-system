const { db } = require("../config/firebase");
const { rankVolunteers } = require("./volunteerRanking");

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

  const ranked = rankVolunteers(candidates, pickupLocation, activeCountByVolunteer);

  return ranked[0].volunteer;
}

/**
 * When a donor drops off several categories in one visit (see "Donation
 * batching" in CLAUDE.md), each category becomes its own donation document,
 * matched independently — without this, auto-assignment could hand each one
 * to a *different* nearest-available volunteer even though they all share
 * one physical pickup, fragmenting a single drop-off across several
 * volunteers who have no idea the others exist.
 *
 * Called before findBestVolunteer() at match time: if any other donation
 * sharing this dropoffId already has an active delivery (pending_acceptance/
 * accepted/picked_up), prefer that same volunteer — as long as they're still
 * marked available — instead of independently recomputing nearest-by-
 * distance, which could easily pick someone else as other volunteers'
 * workloads shift between each category's own match call.
 *
 * Deliberately restricted to ACTIVE_DELIVERY_STATUSES only — a sibling whose
 * delivery was rejected shouldn't have that volunteer defaulted back to
 * (they explicitly declined), and one that's already delivered/confirmed
 * means that volunteer is likely done with this pickup entirely, so there's
 * no strong reason to force them onto a fresh item.
 */
async function findVolunteerForDropoff(dropoffId, excludeDonationId) {
  if (!dropoffId) return null;

  const siblingsSnap = await db.collection("donations").where("dropoffId", "==", dropoffId).get();
  for (const doc of siblingsSnap.docs) {
    if (doc.id === excludeDonationId) continue;
    const sibling = doc.data();
    if (!sibling.assignedDeliveryId) continue;

    const deliveryDoc = await db.collection("deliveries").doc(sibling.assignedDeliveryId).get();
    if (!deliveryDoc.exists) continue;
    const delivery = deliveryDoc.data();
    if (!delivery.volunteerId || !ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) continue;

    const volunteerDoc = await db.collection("users").doc(delivery.volunteerId).get();
    if (!volunteerDoc.exists) continue;
    const volunteerData = volunteerDoc.data();
    if (volunteerData.available === false) continue;

    return { uid: delivery.volunteerId, name: volunteerData.name };
  }
  return null;
}

/**
 * When a victim's single multi-category request gets fulfilled by donations
 * from different, unrelated donors (no shared dropoffId), each category's
 * match used to independently run findBestVolunteer() — meaning the same
 * victim's water and the same victim's food could easily land on two
 * different volunteers with no idea about each other, forcing two separate
 * delivery visits to one household instead of one. Mirrors
 * findVolunteerForDropoff's reasoning exactly, just keyed by the request
 * being fulfilled instead of the donor's own drop-off — see "Fellow
 * travellers" / "Donation batching" in CLAUDE.md.
 *
 * Called after findVolunteerForDropoff (that one wins first — it's the
 * stronger "you're literally at the same pickup point right now" signal)
 * and before findBestVolunteer: if another delivery already exists for this
 * request with an active status and a still-available volunteer, prefer
 * them — regardless of how far apart the two donations' own pickup points
 * are — since one volunteer making two pickups for one delivery visit beats
 * two volunteers each making one.
 *
 * Deliberately restricted to ACTIVE_DELIVERY_STATUSES for the same reason
 * findVolunteerForDropoff is: a sibling item's delivery having been rejected
 * shouldn't default that volunteer back onto a fresh item (they explicitly
 * declined), and one already delivered/confirmed means that volunteer is
 * likely done visiting this victim already.
 */
async function findVolunteerForRequest(requestId, excludeDonationId) {
  if (!requestId) return null;

  // Single equality filter, status/donation checks done in JS — avoids a
  // composite-index dependency, same convention findVolunteerForDropoff and
  // "Internal case notes" (CLAUDE.md) already established for this project.
  const siblingsSnap = await db.collection("deliveries").where("requestId", "==", requestId).get();
  for (const doc of siblingsSnap.docs) {
    const sibling = doc.data();
    if (sibling.donationId === excludeDonationId) continue;
    if (!sibling.volunteerId || !ACTIVE_DELIVERY_STATUSES.includes(sibling.status)) continue;

    const volunteerDoc = await db.collection("users").doc(sibling.volunteerId).get();
    if (!volunteerDoc.exists) continue;
    const volunteerData = volunteerDoc.data();
    if (volunteerData.available === false) continue;

    return { uid: sibling.volunteerId, name: volunteerData.name };
  }
  return null;
}

module.exports = {
  findBestVolunteer,
  findVolunteerForDropoff,
  findVolunteerForRequest,
  rankVolunteers,
  ACTIVE_DELIVERY_STATUSES,
};
