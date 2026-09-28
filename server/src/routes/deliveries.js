const express = require("express");
const crypto = require("crypto");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { computeOverallStatus } = require("../utils/requestItemStatus");
const { logAction } = require("../utils/auditLog");
const { sendNotificationToUser } = require("../utils/notifications");
const { sendSmsToUser } = require("../utils/sms");
const { createChatsForAcceptedDelivery, lockChatsForDelivery, createOrGetFellowTravellerChat } = require("../utils/deliveryChats");
const { nearestDistrict } = require("../utils/districts");

// A delivery is "in transit and worth matching against" once the volunteer
// has actually committed to it — excludes pending_acceptance (could still be
// rejected) and anything past picked_up (already close to done). Used only
// by the fellow-travellers feature below; every other status check in this
// file is unchanged.
const ACTIVE_DELIVERY_STATUSES = ["accepted", "picked_up"];

const DELIVERY_NOTIFICATION_COPY = {
  picked_up: {
    title: "Your delivery is on the way",
    body: "A volunteer has picked up your aid and started heading your way.",
  },
  delivered: {
    title: "Your delivery has arrived",
    body: "Scan the QR code shown by the person delivering your aid to confirm receipt.",
  },
};

/** Looks up the victimId for a delivery's request and sends it a status notification. Fails soft. */
async function notifyVictimOfDeliveryStatus(delivery, deliveryId, status) {
  try {
    const copy = DELIVERY_NOTIFICATION_COPY[status];
    if (!copy) return;
    const requestDoc = await db.collection("aidRequests").doc(delivery.requestId).get();
    if (!requestDoc.exists) return;
    const victimId = requestDoc.data().victimId;
    await sendNotificationToUser(victimId, {
      ...copy,
      data: { type: `delivery.${status}`, deliveryId, requestId: delivery.requestId },
    });
    await sendSmsToUser(victimId, copy.body);
  } catch (err) {
    console.error(`Delivery status notification failed for delivery ${deliveryId}:`, err.message);
  }
}

const router = express.Router();

/**
 * QR-confirmation token: generated once a delivery reaches "delivered",
 * shown (encoded in a QR code) only to whoever has physical custody of the
 * goods — the volunteer or self-delivering donor — never to the victim's
 * own client. The victim must scan it with their device to confirm, which
 * is harder to fake than a same-device button tap.
 */
function generateConfirmToken() {
  return crypto.randomBytes(16).toString("hex");
}

/**
 * POST /api/deliveries
 * Admin: assign a volunteer to a matched request+donation pair, or override
 * the system's auto-assigned pick (see "Automatic volunteer assignment" in
 * CLAUDE.md — auto-assignment normally handles this at match time now;
 * this endpoint is the manual fallback/override, not the common path).
 * Only used for donations with deliveryMethod "volunteer" — self-delivery
 * donations get their delivery record auto-created (and auto-accepted) at
 * match time, in routes/donations.js.
 * Body: { requestId, donationId, volunteerId }
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { requestId, donationId, volunteerId } = req.body;
    if (!requestId || !donationId || !volunteerId) {
      return res.status(400).json({ error: "requestId, donationId, and volunteerId are required." });
    }

    const donationRef = db.collection("donations").doc(donationId);
    const donationDoc = await donationRef.get();
    if (!donationDoc.exists) return res.status(404).json({ error: "Donation not found." });
    const donation = donationDoc.data();

    if (donation.deliveryMethod !== "volunteer") {
      return res.status(400).json({ error: "This donation is set to self-delivery, not volunteer delivery." });
    }

    const now = new Date().toISOString();

    // Already has a delivery — this is a reassign, not a fresh assign.
    // Only allowed while the current volunteer hasn't responded yet; once
    // they've accepted (or moved further), swapping volunteers mid-flight
    // would corrupt state they're already acting on.
    if (donation.assignedDeliveryId) {
      const existingRef = db.collection("deliveries").doc(donation.assignedDeliveryId);
      const existingDoc = await existingRef.get();
      const existing = existingDoc.exists ? existingDoc.data() : null;

      if (!existing || existing.status !== "pending_acceptance") {
        return res.status(409).json({
          error: existing
            ? `This donation's delivery is already "${existing.status}" and can no longer be reassigned.`
            : "This donation already has an active delivery.",
        });
      }

      await existingRef.update({ volunteerId, updatedAt: now });
      await donationRef.update({ updatedAt: now }); // deliveryStatus stays "pending_acceptance", unchanged
      await logAction(req.user, "delivery.reassign", { type: "delivery", id: donation.assignedDeliveryId }, {
        requestId,
        donationId,
        volunteerId,
        previousVolunteerId: existing.volunteerId,
      });
      await sendNotificationToUser(volunteerId, {
        title: "New delivery assignment",
        body: `You've been assigned a ${donation.category} delivery — accept or reject it from My Deliveries.`,
        data: { type: "delivery_assigned", deliveryId: donation.assignedDeliveryId },
      });

      return res.json({ id: donation.assignedDeliveryId, ...existing, volunteerId, updatedAt: now });
    }

    const delivery = {
      requestId,
      donationId,
      category: donation.category,
      // Carries forward the quantity POST /:id/match already decided this
      // match consumes — that decrement happened at match time and can't be
      // recomputed later from remainingQuantity alone (it's already
      // reflected there). Falls back to the donation's own remaining
      // balance for pre-existing donations that predate this field.
      allocatedQuantity: donation.pendingAllocatedQuantity ?? donation.remainingQuantity ?? null,
      volunteerId,
      method: "volunteer",
      status: "pending_acceptance", // pending_acceptance -> accepted | rejected -> picked_up -> delivered -> confirmed
      currentLocation: null,
      dropoffId: donation.dropoffId || null,
      donorName: donation.donorName,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("deliveries").add(delivery);
    await donationRef.update({
      assignedDeliveryId: docRef.id,
      deliveryStatus: "pending_acceptance",
      pendingAllocatedQuantity: null,
      updatedAt: now,
    });
    await logAction(req.user, "delivery.assign", { type: "delivery", id: docRef.id }, {
      requestId,
      donationId,
      volunteerId,
      source: "manual",
    });
    await sendNotificationToUser(volunteerId, {
      title: "New delivery assignment",
      body: `You've been assigned a ${donation.category} delivery — accept or reject it from My Deliveries.`,
      data: { type: "delivery_assigned", deliveryId: docRef.id },
    });

    return res.status(201).json({ id: docRef.id, ...delivery });
  } catch (err) {
    console.error("Create delivery error:", err.message);
    return res.status(500).json({ error: "Failed to create delivery.", details: err.message });
  }
});

/**
 * GET /api/deliveries/mine
 * Volunteer: list deliveries assigned to them (including ones awaiting their
 * accept/reject decision).
 */
router.get("/mine", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const snapshot = await db.collection("deliveries").where("volunteerId", "==", req.user.uid).get();
    const deliveries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(deliveries);
  } catch (err) {
    console.error("List my deliveries error:", err.message);
    return res.status(500).json({ error: "Failed to list your deliveries.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/:id/accept
 * Volunteer accepts an assignment.
 */
router.patch("/:id/accept", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const ref = db.collection("deliveries").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = doc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    if (delivery.status !== "pending_acceptance") {
      return res.status(400).json({ error: `Cannot accept a delivery in "${delivery.status}" status.` });
    }

    const now = new Date().toISOString();
    await ref.update({ status: "accepted", updatedAt: now });
    await db.collection("donations").doc(delivery.donationId).update({
      deliveryStatus: "accepted",
      lastRejectionReason: null, // clear any note left by a previous volunteer's rejection
      updatedAt: now,
    });
    await createChatsForAcceptedDelivery(delivery, req.params.id);

    return res.json({ id: req.params.id, status: "accepted" });
  } catch (err) {
    console.error("Accept delivery error:", err.message);
    return res.status(500).json({ error: "Failed to accept delivery.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/:id/reject
 * Volunteer declines an assignment. Reopens the donation so admin can
 * assign a different volunteer — the request/donation match itself is
 * untouched, only the volunteer assignment resets.
 */
router.patch("/:id/reject", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const ref = db.collection("deliveries").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = doc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    if (delivery.status !== "pending_acceptance") {
      return res.status(400).json({ error: `Cannot reject a delivery in "${delivery.status}" status.` });
    }

    const reason = (req.body?.reason || "").trim() || null;
    const now = new Date().toISOString();
    await ref.update({ status: "rejected", rejectionReason: reason, updatedAt: now });
    await db.collection("donations").doc(delivery.donationId).update({
      assignedDeliveryId: null,
      deliveryStatus: null,
      lastRejectionReason: reason,
      updatedAt: now,
    });

    return res.json({ id: req.params.id, status: "rejected" });
  } catch (err) {
    console.error("Reject delivery error:", err.message);
    return res.status(500).json({ error: "Failed to reject delivery.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/:id/status
 * Volunteer updates delivery progress once accepted.
 * Body: { status: "picked_up" | "delivered", currentLocation?: {lat,lng} }
 */
router.patch("/:id/status", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const { status, currentLocation } = req.body;
    if (!["picked_up", "delivered"].includes(status)) {
      return res.status(400).json({ error: 'status must be "picked_up" or "delivered".' });
    }

    const ref = db.collection("deliveries").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = doc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    const allowedFrom = { picked_up: "accepted", delivered: "picked_up" };
    if (delivery.status !== allowedFrom[status]) {
      return res.status(400).json({ error: `Cannot mark as "${status}" from "${delivery.status}".` });
    }

    const now = new Date().toISOString();
    const update = { status, updatedAt: now };
    if (currentLocation) update.currentLocation = currentLocation;
    if (status === "delivered") update.confirmToken = generateConfirmToken();

    await ref.update(update);
    await db.collection("donations").doc(delivery.donationId).update({ deliveryStatus: status, updatedAt: now });
    await notifyVictimOfDeliveryStatus(delivery, req.params.id, status);

    return res.json({ id: req.params.id, ...update });
  } catch (err) {
    console.error("Update delivery status error:", err.message);
    return res.status(500).json({ error: "Failed to update delivery.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/:id/self-deliver
 * Donor marks their own self-delivery donation as delivered (no pickup step
 * — they already have the goods).
 */
router.patch("/:id/self-deliver", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const ref = db.collection("deliveries").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = doc.data();

    if (delivery.method !== "self") {
      return res.status(400).json({ error: "This delivery is not a self-delivery." });
    }

    const donationDoc = await db.collection("donations").doc(delivery.donationId).get();
    if (!donationDoc.exists || donationDoc.data().donorId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery doesn't belong to one of your donations." });
    }
    if (delivery.status !== "accepted") {
      return res.status(400).json({ error: `Cannot mark as delivered from "${delivery.status}".` });
    }

    const now = new Date().toISOString();
    const confirmToken = generateConfirmToken();
    await ref.update({ status: "delivered", confirmToken, updatedAt: now });
    await db.collection("donations").doc(delivery.donationId).update({ deliveryStatus: "delivered", updatedAt: now });
    await notifyVictimOfDeliveryStatus(delivery, req.params.id, "delivered");

    return res.json({ id: req.params.id, status: "delivered", confirmToken });
  } catch (err) {
    console.error("Self-deliver error:", err.message);
    return res.status(500).json({ error: "Failed to mark as delivered.", details: err.message });
  }
});

/**
 * GET /api/deliveries/by-request/:requestId
 * Victim: list all deliveries tied to one of their own requests (one per
 * matched category), so the UI can show progress and confirm-receipt
 * buttons per item.
 */
router.get("/by-request/:requestId", requireAuth, requireRole("victim"), async (req, res) => {
  try {
    const requestDoc = await db.collection("aidRequests").doc(req.params.requestId).get();
    if (!requestDoc.exists) return res.status(404).json({ error: "Request not found." });
    if (requestDoc.data().victimId !== req.user.uid) {
      return res.status(403).json({ error: "This request doesn't belong to you." });
    }

    const snapshot = await db
      .collection("deliveries")
      .where("requestId", "==", req.params.requestId)
      .get();

    // Never send confirmToken to the victim's own client — it's shown to
    // them via QR code by whoever has the goods, not handed over in the API.
    const deliveries = snapshot.docs.map((doc) => {
      const { confirmToken: _confirmToken, ...rest } = doc.data();
      return { id: doc.id, ...rest };
    });
    return res.json(deliveries);
  } catch (err) {
    console.error("Lookup delivery by request error:", err.message);
    return res.status(500).json({ error: "Failed to look up deliveries.", details: err.message });
  }
});

/**
 * GET /api/deliveries/:id/navigation-info
 * Volunteer: pickup + dropoff coordinates for one of their own deliveries,
 * for the turn-by-turn navigation screen. Combines donation.location
 * (pickup) and the linked request's location (dropoff) into one response —
 * a volunteer has no other endpoint that would let them read either
 * document directly (donations/requests are admin/donor/victim-scoped).
 */
router.get("/:id/navigation-info", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const deliveryDoc = await db.collection("deliveries").doc(req.params.id).get();
    if (!deliveryDoc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = deliveryDoc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }

    const [donationDoc, requestDoc] = await Promise.all([
      db.collection("donations").doc(delivery.donationId).get(),
      db.collection("aidRequests").doc(delivery.requestId).get(),
    ]);
    if (!donationDoc.exists || !requestDoc.exists) {
      return res.status(404).json({ error: "The donation or request behind this delivery no longer exists." });
    }

    return res.json({
      id: req.params.id,
      status: delivery.status,
      category: delivery.category,
      pickupLocation: donationDoc.data().location,
      dropoffLocation: requestDoc.data().location,
    });
  } catch (err) {
    console.error("Delivery navigation-info error:", err.message);
    return res.status(500).json({ error: "Failed to load navigation info.", details: err.message });
  }
});

/**
 * GET /api/deliveries/by-donation/:donationId
 * Donor: look up every delivery tied to one of their own donations (used for
 * the self-delivery "Mark as delivered" button and QR display). Returns an
 * array, not a single delivery-or-null as before — a donation can now be
 * matched more than once over its lifetime once it has leftover
 * remainingQuantity (see "Donation leftover-quantity tracking" in
 * CLAUDE.md), so it can have more than one delivery. The only two callers
 * (DonorMyDonations.tsx web + mobile) were updated to render a list instead
 * of assuming exactly one, in the same pass this changed.
 */
router.get("/by-donation/:donationId", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const donationDoc = await db.collection("donations").doc(req.params.donationId).get();
    if (!donationDoc.exists) return res.status(404).json({ error: "Donation not found." });
    if (donationDoc.data().donorId !== req.user.uid) {
      return res.status(403).json({ error: "This donation doesn't belong to you." });
    }

    const snapshot = await db.collection("deliveries").where("donationId", "==", req.params.donationId).get();
    const deliveries = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    return res.json(deliveries);
  } catch (err) {
    console.error("Lookup delivery by donation error:", err.message);
    return res.status(500).json({ error: "Failed to look up delivery.", details: err.message });
  }
});

/**
 * POST /api/deliveries/:id/confirm
 * Victim confirms receipt of one item. Marks that delivery confirmed, marks
 * the matching request item + donation delivered, and recomputes the
 * request's overall status (only "delivered" once every item is).
 */
router.post("/:id/confirm", requireAuth, requireRole("victim"), async (req, res) => {
  try {
    const ref = db.collection("deliveries").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = doc.data();

    const requestRef = db.collection("aidRequests").doc(delivery.requestId);
    const requestDoc = await requestRef.get();
    if (!requestDoc.exists || requestDoc.data().victimId !== req.user.uid) {
      return res.status(403).json({ error: "You can only confirm deliveries for your own requests." });
    }
    if (delivery.status !== "delivered") {
      return res.status(400).json({ error: `Cannot confirm a delivery in "${delivery.status}" status.` });
    }
    if (!req.body?.token || req.body.token !== delivery.confirmToken) {
      return res.status(403).json({
        error: "Invalid or missing confirmation code. Scan the QR code shown by the person delivering your aid.",
      });
    }

    const now = new Date().toISOString();
    const requestData = requestDoc.data();
    const updatedItems = requestData.items.map((item) =>
      item.category === delivery.category && item.donationId === delivery.donationId
        ? { ...item, status: "delivered" }
        : item
    );
    const newRequestStatus = computeOverallStatus(updatedItems);

    await ref.update({ status: "confirmed", updatedAt: now });
    await requestRef.update({ items: updatedItems, status: newRequestStatus, updatedAt: now });
    await db.collection("donations").doc(delivery.donationId).update({ status: "delivered", updatedAt: now });
    await lockChatsForDelivery(req.params.id);

    return res.json({ id: req.params.id, status: "confirmed", requestStatus: newRequestStatus });
  } catch (err) {
    console.error("Confirm delivery error:", err.message);
    return res.status(500).json({ error: "Failed to confirm delivery.", details: err.message });
  }
});

/**
 * GET /api/deliveries/:id/fellow-travellers
 * Volunteer: other currently-active deliveries (accepted/picked_up),
 * assigned to a DIFFERENT volunteer, heading to the same destination
 * district as this one — see "Fellow travellers" in CLAUDE.md.
 * ?sameOrigin=true additionally requires a matching origin district.
 *
 * Purely read-only — touches no delivery/donation/request state, and
 * changes nothing about how deliveries are assigned, tracked, or
 * confirmed. Runs via the Admin SDK (like every other cross-user
 * aggregation in this app, e.g. GET /api/stats/district-need) because a
 * volunteer's own client can only read deliveries where
 * `volunteerId == self` per the Firestore rules — there's no way to do
 * this matching from the client directly.
 *
 * Response is deliberately anonymized: no volunteer name, no donor/victim
 * data, just district/category/status. Identity is only ever revealed
 * through the existing consent-gated chat (POST .../chat below), same
 * privacy posture as every other party pairing in this app.
 */
router.get("/:id/fellow-travellers", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const deliveryDoc = await db.collection("deliveries").doc(req.params.id).get();
    if (!deliveryDoc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = deliveryDoc.data();
    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
      return res.json([]); // not currently in transit — nothing to match against
    }

    const [donationDoc, requestDoc] = await Promise.all([
      db.collection("donations").doc(delivery.donationId).get(),
      db.collection("aidRequests").doc(delivery.requestId).get(),
    ]);
    if (!donationDoc.exists || !requestDoc.exists) return res.json([]);
    const myOrigin = donationDoc.data().district || nearestDistrict(donationDoc.data().location);
    const myDropoffId = donationDoc.data().dropoffId || null;
    const myDestination = nearestDistrict(requestDoc.data().location);
    if (!myDestination) return res.json([]);

    const sameOriginOnly = req.query.sameOrigin === "true";

    const snapshot = await db.collection("deliveries").where("status", "in", ACTIVE_DELIVERY_STATUSES).get();
    const candidates = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((d) => d.id !== req.params.id && d.volunteerId && d.volunteerId !== req.user.uid);

    const results = [];
    for (const candidate of candidates) {
      const [cDonationDoc, cRequestDoc] = await Promise.all([
        db.collection("donations").doc(candidate.donationId).get(),
        db.collection("aidRequests").doc(candidate.requestId).get(),
      ]);
      if (!cDonationDoc.exists || !cRequestDoc.exists) continue;
      const cDestination = nearestDistrict(cRequestDoc.data().location);
      const cOrigin = cDonationDoc.data().district || nearestDistrict(cDonationDoc.data().location);
      // A sibling from the SAME physical drop-off (dropoffId) is always
      // surfaced, regardless of where its own item is headed — the whole
      // point is "you're literally collecting from the same place as this
      // other volunteer," which matters even when the two items serve
      // different victims in different districts. Same idea for a sibling
      // fulfilling the SAME request (same victim, different donor) — it
      // always shares a destination by definition (same victim's own
      // location), so it would already pass the destination check below,
      // but it's flagged separately so the UI can say "same victim," not
      // just "happens to share a district." Everything else still needs a
      // genuine destination (and, if requested, origin) match — see
      // "Donation batching" / "Fellow travellers" in CLAUDE.md.
      const sameDropoff = Boolean(myDropoffId) && cDonationDoc.data().dropoffId === myDropoffId;
      const sameRequest = candidate.requestId === delivery.requestId;
      if (!sameDropoff && !sameRequest) {
        if (!cDestination || cDestination !== myDestination) continue;
        if (sameOriginOnly && cOrigin !== myOrigin) continue;
      }

      results.push({
        deliveryId: candidate.id,
        category: candidate.category,
        originDistrict: cOrigin,
        destinationDistrict: cDestination,
        status: candidate.status,
        sameDropoff,
        sameRequest,
      });
    }

    // Same-dropoff siblings surface first (the strongest, most actionable
    // match — "you're both collecting from the same place right now"),
    // then same-request siblings ("this is the same victim's other item"),
    // ahead of ordinary destination-only matches.
    results.sort((a, b) => Number(b.sameDropoff) - Number(a.sameDropoff) || Number(b.sameRequest) - Number(a.sameRequest));
    return res.json(results);
  } catch (err) {
    console.error("Fellow travellers lookup error:", err.message);
    return res.status(500).json({ error: "Failed to look up fellow travellers.", details: err.message });
  }
});

/** True when both deliveries' donations share the same non-null dropoffId —
 * i.e. they're literally the same physical drop-off, regardless of where
 * each item is headed. Used to relax the "same destination district"
 * requirement on the chat-start and handoff routes below, mirroring the
 * same bypass GET /:id/fellow-travellers already applies when listing
 * candidates (see "Donation batching" in CLAUDE.md). */
async function deliveriesShareDropoff(delivery, other) {
  const [donationDoc, otherDonationDoc] = await Promise.all([
    db.collection("donations").doc(delivery.donationId).get(),
    db.collection("donations").doc(other.donationId).get(),
  ]);
  const dropoffId = donationDoc.exists ? donationDoc.data().dropoffId : null;
  const otherDropoffId = otherDonationDoc.exists ? otherDonationDoc.data().dropoffId : null;
  return Boolean(dropoffId) && dropoffId === otherDropoffId;
}

/**
 * POST /api/deliveries/:id/fellow-travellers/:otherId/chat
 * Volunteer: start (or re-open) a consent-gated chat with the volunteer on
 * :otherId — a delivery surfaced by GET /:id/fellow-travellers above.
 * Re-validates the match server-side rather than trusting whatever the
 * client's last fetch showed (either delivery could have moved on —
 * delivered, reassigned, etc. — in between).
 */
router.post("/:id/fellow-travellers/:otherId/chat", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const [deliveryDoc, otherDoc] = await Promise.all([
      db.collection("deliveries").doc(req.params.id).get(),
      db.collection("deliveries").doc(req.params.otherId).get(),
    ]);
    if (!deliveryDoc.exists || !otherDoc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = deliveryDoc.data();
    const other = otherDoc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    if (!other.volunteerId || other.volunteerId === req.user.uid) {
      return res.status(400).json({ error: "That delivery isn't assigned to a different volunteer." });
    }
    if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status) || !ACTIVE_DELIVERY_STATUSES.includes(other.status)) {
      return res.status(400).json({ error: "Both deliveries must be currently active (accepted or picked up)." });
    }

    if (!(await deliveriesShareDropoff(delivery, other))) {
      const [requestDoc, otherRequestDoc] = await Promise.all([
        db.collection("aidRequests").doc(delivery.requestId).get(),
        db.collection("aidRequests").doc(other.requestId).get(),
      ]);
      if (!requestDoc.exists || !otherRequestDoc.exists) {
        return res.status(404).json({ error: "The request behind one of these deliveries no longer exists." });
      }
      const myDestination = nearestDistrict(requestDoc.data().location);
      const otherDestination = nearestDistrict(otherRequestDoc.data().location);
      if (!myDestination || myDestination !== otherDestination) {
        return res.status(400).json({ error: "These two deliveries aren't heading to the same district." });
      }
    }

    const chatId = await createOrGetFellowTravellerChat(req.params.id, req.user.uid, req.params.otherId, other.volunteerId);
    return res.json({ chatId });
  } catch (err) {
    console.error("Fellow traveller chat error:", err.message);
    return res.status(500).json({ error: "Failed to start chat.", details: err.message });
  }
});

/**
 * Fellow travellers Phase 2 — handoff. See "Fellow travellers" in CLAUDE.md
 * for the full design (this was explicitly deferred from Phase 1 pending
 * its own review, since it touches actual delivery ownership rather than
 * just read-only visibility + chat).
 *
 * A handoff is a two-step, confirmation-required transfer: Volunteer 1
 * proposes it (POST /:id/handoff) to a volunteer currently surfaced by
 * their own GET /:id/fellow-travellers list — re-validated server-side
 * here, same as the chat-start route above, never trusted from the client.
 * Volunteer 2 then accepts or declines; only accepting actually changes
 * `deliveries.volunteerId`. Only ever eligible while the delivery is still
 * `accepted`/`picked_up` (ACTIVE_DELIVERY_STATUSES) — once `delivered`, a
 * confirmToken/QR already exists and a handoff no longer makes sense.
 */

/** The destination district a delivery is headed to, or null. Small and
 * deliberately separate from the fellow-travellers routes above (rather
 * than refactored to share one helper) so nothing already-verified there
 * needed to be touched to add this. */
async function getDeliveryDestinationDistrict(delivery) {
  const requestDoc = await db.collection("aidRequests").doc(delivery.requestId).get();
  if (!requestDoc.exists) return null;
  return nearestDistrict(requestDoc.data().location);
}

/**
 * POST /api/deliveries/:id/handoff
 * Volunteer: propose handing off delivery :id to whichever volunteer owns
 * `otherDeliveryId` — a delivery surfaced by GET /:id/fellow-travellers,
 * same pattern as the fellow-traveller chat-start route (the client only
 * ever knows another delivery's id, never a volunteer's uid directly — that
 * anonymity is deliberate, see GET /:id/fellow-travellers above). The
 * target volunteer is resolved server-side from that delivery. Only one
 * pending handoff allowed per delivery at a time (prevents two different
 * volunteers both trying to accept the same delivery at once).
 */
router.post("/:id/handoff", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const { otherDeliveryId } = req.body;
    if (!otherDeliveryId) return res.status(400).json({ error: "otherDeliveryId is required." });
    if (otherDeliveryId === req.params.id) {
      return res.status(400).json({ error: "You can't hand off a delivery to itself." });
    }

    const [deliveryDoc, otherDoc] = await Promise.all([
      db.collection("deliveries").doc(req.params.id).get(),
      db.collection("deliveries").doc(otherDeliveryId).get(),
    ]);
    if (!deliveryDoc.exists || !otherDoc.exists) return res.status(404).json({ error: "Delivery not found." });
    const delivery = deliveryDoc.data();
    const other = otherDoc.data();

    if (delivery.volunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This delivery isn't assigned to you." });
    }
    if (!ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
      return res.status(400).json({ error: "This delivery is no longer active — it can't be handed off." });
    }
    if (!other.volunteerId || other.volunteerId === req.user.uid) {
      return res.status(400).json({ error: "That delivery isn't assigned to a different volunteer." });
    }
    if (!ACTIVE_DELIVERY_STATUSES.includes(other.status)) {
      return res.status(400).json({ error: "That volunteer's own delivery is no longer active." });
    }
    const toVolunteerId = other.volunteerId;

    // Re-validate the match server-side rather than trusting the client's
    // last fellow-travellers fetch: the two deliveries must still share a
    // destination district right now — unless they're literally the same
    // physical drop-off (dropoffId), in which case a handoff makes sense
    // regardless of where each item is headed (see deliveriesShareDropoff's
    // own doc comment above, and "Donation batching" in CLAUDE.md).
    let myDestination = null;
    if (!(await deliveriesShareDropoff(delivery, other))) {
      const theirDestination = await getDeliveryDestinationDistrict(other);
      myDestination = await getDeliveryDestinationDistrict(delivery);
      if (!myDestination || myDestination !== theirDestination) {
        return res.status(400).json({ error: "These two deliveries aren't heading to the same district." });
      }
    } else {
      myDestination = await getDeliveryDestinationDistrict(delivery);
    }

    const existingPending = await db
      .collection("deliveryHandoffs")
      .where("deliveryId", "==", req.params.id)
      .where("status", "==", "pending")
      .get();
    if (!existingPending.empty) {
      return res.status(409).json({ error: "This delivery already has a pending handoff request." });
    }

    const now = new Date().toISOString();
    const handoff = {
      deliveryId: req.params.id,
      fromVolunteerId: req.user.uid,
      toVolunteerId,
      category: delivery.category,
      destinationDistrict: myDestination,
      status: "pending",
      requestedAt: now,
      respondedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    const handoffRef = await db.collection("deliveryHandoffs").add(handoff);

    await sendNotificationToUser(toVolunteerId, {
      title: "Delivery handoff request",
      body: `A fellow volunteer wants to hand off a ${delivery.category} delivery to you.`,
      data: { type: "handoff.requested", handoffId: handoffRef.id, deliveryId: req.params.id },
    });

    return res.status(201).json({ id: handoffRef.id, ...handoff });
  } catch (err) {
    console.error("Create handoff error:", err.message);
    return res.status(500).json({ error: "Failed to create handoff request.", details: err.message });
  }
});

/**
 * GET /api/deliveries/handoffs/mine
 * Volunteer: every handoff they're involved in, either direction (sent or
 * received) — two queries merged in JS, same pattern as chats.js's GET
 * /mine (Firestore can't OR across two different fields in one query).
 */
router.get("/handoffs/mine", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const [sent, received] = await Promise.all([
      db.collection("deliveryHandoffs").where("fromVolunteerId", "==", req.user.uid).get(),
      db.collection("deliveryHandoffs").where("toVolunteerId", "==", req.user.uid).get(),
    ]);
    const handoffs = [...sent.docs, ...received.docs]
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json(handoffs);
  } catch (err) {
    console.error("List my handoffs error:", err.message);
    return res.status(500).json({ error: "Failed to list handoffs.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/handoffs/:id/accept
 * The recipient volunteer accepts — this is the one place that actually
 * changes deliveries.volunteerId post-acceptance. Re-validates the delivery
 * is still owned by the requester and still active (it may have moved on —
 * delivered, or a different handoff already accepted — since the request
 * was made). Locks the OLD volunteer's two delivery chats as a preserved
 * history record and opens a brand-new pair for the new volunteer (see
 * chatIdFor()'s handoffVersion scheme in deliveryChats.js) rather than
 * reusing/rebinding the old ones.
 */
router.patch("/handoffs/:id/accept", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const handoffRef = db.collection("deliveryHandoffs").doc(req.params.id);
    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) return res.status(404).json({ error: "Handoff request not found." });
    const handoff = handoffDoc.data();

    if (handoff.toVolunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This handoff request wasn't sent to you." });
    }
    if (handoff.status !== "pending") {
      return res.status(400).json({ error: `This handoff request is already "${handoff.status}".` });
    }

    const deliveryRef = db.collection("deliveries").doc(handoff.deliveryId);
    const deliveryDoc = await deliveryRef.get();
    if (!deliveryDoc.exists) return res.status(404).json({ error: "The delivery behind this handoff no longer exists." });
    const delivery = deliveryDoc.data();

    if (delivery.volunteerId !== handoff.fromVolunteerId || !ACTIVE_DELIVERY_STATUSES.includes(delivery.status)) {
      return res.status(409).json({
        error: "This delivery is no longer available for handoff — it may have already moved on.",
      });
    }

    const now = new Date().toISOString();
    const newHandoffVersion = (delivery.handoffVersion || 0) + 1;
    const updatedDelivery = { ...delivery, volunteerId: req.user.uid };

    await deliveryRef.update({ volunteerId: req.user.uid, handoffVersion: newHandoffVersion, updatedAt: now });
    await lockChatsForDelivery(handoff.deliveryId); // freezes the OLD volunteer's two chats as history
    await createChatsForAcceptedDelivery(updatedDelivery, handoff.deliveryId, newHandoffVersion); // fresh pair for the new volunteer
    await handoffRef.update({ status: "accepted", respondedAt: now, updatedAt: now });

    await logAction(req.user, "delivery.handoff", { type: "delivery", id: handoff.deliveryId }, {
      previousVolunteerId: handoff.fromVolunteerId,
      newVolunteerId: req.user.uid,
      requestId: delivery.requestId,
      donationId: delivery.donationId,
    });

    const [donationDoc, requestDoc] = await Promise.all([
      db.collection("donations").doc(delivery.donationId).get(),
      db.collection("aidRequests").doc(delivery.requestId).get(),
    ]);
    await Promise.all([
      sendNotificationToUser(handoff.fromVolunteerId, {
        title: "Handoff accepted",
        body: "The other volunteer accepted your delivery handoff request.",
        data: { type: "handoff.accepted", deliveryId: handoff.deliveryId },
      }),
      donationDoc.exists &&
        sendNotificationToUser(donationDoc.data().donorId, {
          title: "Delivery volunteer changed",
          body: "A different volunteer has taken over your delivery — everything else about it is unchanged.",
          data: { type: "handoff.accepted", deliveryId: handoff.deliveryId },
        }),
      requestDoc.exists &&
        sendNotificationToUser(requestDoc.data().victimId, {
          title: "Delivery volunteer changed",
          body: "A different volunteer has taken over your delivery — everything else about it is unchanged.",
          data: { type: "handoff.accepted", deliveryId: handoff.deliveryId },
        }),
    ]);

    return res.json({ id: handoff.deliveryId, status: delivery.status, volunteerId: req.user.uid });
  } catch (err) {
    console.error("Accept handoff error:", err.message);
    return res.status(500).json({ error: "Failed to accept handoff.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/handoffs/:id/decline
 * The recipient volunteer declines — a no-op on the delivery itself, so
 * Volunteer 1 keeps their assignment and can propose a handoff to someone
 * else.
 */
router.patch("/handoffs/:id/decline", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const handoffRef = db.collection("deliveryHandoffs").doc(req.params.id);
    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) return res.status(404).json({ error: "Handoff request not found." });
    const handoff = handoffDoc.data();

    if (handoff.toVolunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This handoff request wasn't sent to you." });
    }
    if (handoff.status !== "pending") {
      return res.status(400).json({ error: `This handoff request is already "${handoff.status}".` });
    }

    const now = new Date().toISOString();
    await handoffRef.update({ status: "declined", respondedAt: now, updatedAt: now });
    await sendNotificationToUser(handoff.fromVolunteerId, {
      title: "Handoff declined",
      body: "The other volunteer declined your delivery handoff request.",
      data: { type: "handoff.declined", deliveryId: handoff.deliveryId },
    });

    return res.json({ id: req.params.id, status: "declined" });
  } catch (err) {
    console.error("Decline handoff error:", err.message);
    return res.status(500).json({ error: "Failed to decline handoff.", details: err.message });
  }
});

/**
 * PATCH /api/deliveries/handoffs/:id/cancel
 * The sender withdraws their own still-pending request.
 */
router.patch("/handoffs/:id/cancel", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const handoffRef = db.collection("deliveryHandoffs").doc(req.params.id);
    const handoffDoc = await handoffRef.get();
    if (!handoffDoc.exists) return res.status(404).json({ error: "Handoff request not found." });
    const handoff = handoffDoc.data();

    if (handoff.fromVolunteerId !== req.user.uid) {
      return res.status(403).json({ error: "This handoff request isn't yours to cancel." });
    }
    if (handoff.status !== "pending") {
      return res.status(400).json({ error: `This handoff request is already "${handoff.status}".` });
    }

    const now = new Date().toISOString();
    await handoffRef.update({ status: "cancelled", respondedAt: now, updatedAt: now });
    await sendNotificationToUser(handoff.toVolunteerId, {
      title: "Handoff request withdrawn",
      body: "The other volunteer withdrew their delivery handoff request.",
      data: { type: "handoff.cancelled", deliveryId: handoff.deliveryId },
    });

    return res.json({ id: req.params.id, status: "cancelled" });
  } catch (err) {
    console.error("Cancel handoff error:", err.message);
    return res.status(500).json({ error: "Failed to cancel handoff.", details: err.message });
  }
});

module.exports = router;
