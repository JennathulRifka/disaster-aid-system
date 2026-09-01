const express = require("express");
const crypto = require("crypto");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { computeOverallStatus } = require("../utils/requestItemStatus");
const { logAction } = require("../utils/auditLog");
const { sendNotificationToUser } = require("../utils/notifications");
const { sendSmsToUser } = require("../utils/sms");
const { createChatsForAcceptedDelivery, lockChatsForDelivery } = require("../utils/deliveryChats");

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

      return res.json({ id: donation.assignedDeliveryId, ...existing, volunteerId, updatedAt: now });
    }

    const delivery = {
      requestId,
      donationId,
      category: donation.category,
      volunteerId,
      method: "volunteer",
      status: "pending_acceptance", // pending_acceptance -> accepted | rejected -> picked_up -> delivered -> confirmed
      currentLocation: null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("deliveries").add(delivery);
    await donationRef.update({
      assignedDeliveryId: docRef.id,
      deliveryStatus: "pending_acceptance",
      updatedAt: now,
    });
    await logAction(req.user, "delivery.assign", { type: "delivery", id: docRef.id }, {
      requestId,
      donationId,
      volunteerId,
      source: "manual",
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
      const { confirmToken, ...rest } = doc.data();
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
 * Donor: look up the delivery tied to one of their own donations (used for
 * the self-delivery "Mark as delivered" button).
 */
router.get("/by-donation/:donationId", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const donationDoc = await db.collection("donations").doc(req.params.donationId).get();
    if (!donationDoc.exists) return res.status(404).json({ error: "Donation not found." });
    if (donationDoc.data().donorId !== req.user.uid) {
      return res.status(403).json({ error: "This donation doesn't belong to you." });
    }

    const snapshot = await db
      .collection("deliveries")
      .where("donationId", "==", req.params.donationId)
      .limit(1)
      .get();

    if (snapshot.empty) return res.json(null);
    const doc = snapshot.docs[0];
    return res.json({ id: doc.id, ...doc.data() });
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

module.exports = router;
