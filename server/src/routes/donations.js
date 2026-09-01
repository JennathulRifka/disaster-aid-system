const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { getCategoryLimits } = require("../utils/categories");
const { computeOverallStatus } = require("../utils/requestItemStatus");
const { distanceKm } = require("../utils/geo");
const { logAction } = require("../utils/auditLog");
const { findBestVolunteer } = require("../utils/autoAssignVolunteer");
const { createChatForSelfDelivery } = require("../utils/deliveryChats");

const router = express.Router();

const REQUESTABLE_STATUSES = ["verified", "in_progress"];

/**
 * POST /api/donations
 * Donor registers a donation.
 * Body: { category, quantity, location: {lat, lng}, deliveryMethod: "self"|"volunteer", notes? }
 */
router.post("/", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const { category, quantity, location, deliveryMethod, notes } = req.body;
    if (!category || !quantity || !location || !deliveryMethod) {
      return res.status(400).json({
        error: "category, quantity, location, and deliveryMethod are required.",
      });
    }
    const categoryLimits = await getCategoryLimits();
    if (!Object.keys(categoryLimits).includes(category)) {
      return res.status(400).json({ error: `"${category}" is not a recognized category.` });
    }
    if (!["self", "volunteer"].includes(deliveryMethod)) {
      return res.status(400).json({ error: 'deliveryMethod must be "self" or "volunteer".' });
    }

    const now = new Date().toISOString();
    const donation = {
      donorId: req.user.uid,
      donorName: req.user.name,
      category,
      quantity,
      location,
      deliveryMethod,
      notes: notes || "",
      status: "available", // available -> matched -> delivered
      matchedRequestId: null,
      assignedDeliveryId: null,
      deliveryStatus: null,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("donations").add(donation);
    return res.status(201).json({ id: docRef.id, ...donation });
  } catch (err) {
    console.error("Create donation error:", err.message);
    return res.status(500).json({ error: "Failed to create donation.", details: err.message });
  }
});

/**
 * GET /api/donations
 * Admin: list all donations. Optional ?status=available
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    let query = db.collection("donations");
    if (req.query.status) query = query.where("status", "==", req.query.status);
    const snapshot = await query.get();
    const donations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(donations);
  } catch (err) {
    console.error("List donations error:", err.message);
    return res.status(500).json({ error: "Failed to list donations.", details: err.message });
  }
});

/**
 * GET /api/donations/mine
 * Donor: list their own donations.
 */
router.get("/mine", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const snapshot = await db.collection("donations").where("donorId", "==", req.user.uid).get();
    const donations = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(donations);
  } catch (err) {
    console.error("List my donations error:", err.message);
    return res.status(500).json({ error: "Failed to list your donations.", details: err.message });
  }
});

/**
 * POST /api/donations/:id/match
 * Admin: match a donation to the best waiting request that still needs this
 * donation's category — scored by highest priority first, then closest
 * location. A request can need several categories, so it stays eligible
 * (status "verified" or "in_progress") as long as at least one item is
 * still unmatched.
 *
 * If the donation is self-delivered, the delivery record is created right
 * away (no volunteer to pick) and auto-accepted since the donor already
 * committed to delivering it themselves.
 *
 * If it's a volunteer delivery, the system now auto-assigns the nearest
 * available volunteer (see utils/autoAssignVolunteer.js) — same
 * pending_acceptance flow as before, the volunteer still explicitly
 * accepts/rejects. If no volunteer qualifies (none available, or none with
 * a location on file), the donation is left unassigned exactly like before
 * this feature existed, and an admin can still assign manually.
 */
router.post("/:id/match", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const donationRef = db.collection("donations").doc(req.params.id);
    const donationDoc = await donationRef.get();
    if (!donationDoc.exists) return res.status(404).json({ error: "Donation not found." });
    const donation = donationDoc.data();

    const requestsSnap = await db
      .collection("aidRequests")
      .where("requestedCategories", "array-contains", donation.category)
      .where("status", "in", REQUESTABLE_STATUSES)
      .get();

    const candidates = requestsSnap.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((r) => (r.items || []).some((item) => item.category === donation.category && item.status === "pending"))
      .map((r) => ({ ...r, distanceKm: distanceKm(donation.location, r.location) }))
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0) || a.distanceKm - b.distanceKm);

    if (candidates.length === 0) {
      return res.status(404).json({ error: "No verified requests still need this donation's category." });
    }

    const bestMatch = candidates[0];
    const now = new Date().toISOString();

    const updatedItems = bestMatch.items.map((item) =>
      item.category === donation.category && item.status === "pending"
        ? { ...item, status: "matched", donationId: req.params.id }
        : item
    );
    const newRequestStatus = computeOverallStatus(updatedItems);

    await db.collection("aidRequests").doc(bestMatch.id).update({
      items: updatedItems,
      status: newRequestStatus,
      updatedAt: now,
    });

    const donationUpdate = {
      status: "matched",
      matchedRequestId: bestMatch.id,
      updatedAt: now,
    };

    let deliveryId = null;
    let autoAssignedVolunteer = null;
    if (donation.deliveryMethod === "self") {
      const delivery = {
        requestId: bestMatch.id,
        donationId: req.params.id,
        category: donation.category,
        volunteerId: null,
        method: "self",
        status: "accepted", // self-delivery skips the volunteer accept step
        currentLocation: null,
        createdAt: now,
        updatedAt: now,
      };
      const deliveryRef = await db.collection("deliveries").add(delivery);
      deliveryId = deliveryRef.id;
      donationUpdate.assignedDeliveryId = deliveryId;
      donationUpdate.deliveryStatus = "accepted";
      await createChatForSelfDelivery(deliveryId, bestMatch.id, req.params.id, donation.donorId, bestMatch.victimId);
    } else {
      // Volunteer delivery — try to auto-assign the nearest available
      // volunteer. Leaves the donation unassigned (same as before this
      // feature existed) if nobody qualifies, so an admin can still assign
      // manually from AdminDonations.tsx.
      const volunteer = await findBestVolunteer(donation.location);
      if (volunteer) {
        const delivery = {
          requestId: bestMatch.id,
          donationId: req.params.id,
          category: donation.category,
          volunteerId: volunteer.uid,
          method: "volunteer",
          status: "pending_acceptance",
          currentLocation: null,
          createdAt: now,
          updatedAt: now,
        };
        const deliveryRef = await db.collection("deliveries").add(delivery);
        deliveryId = deliveryRef.id;
        donationUpdate.assignedDeliveryId = deliveryId;
        donationUpdate.deliveryStatus = "pending_acceptance";
        autoAssignedVolunteer = { id: volunteer.uid, name: volunteer.name };
        await logAction(req.user, "delivery.assign", { type: "delivery", id: deliveryId }, {
          requestId: bestMatch.id,
          donationId: req.params.id,
          volunteerId: volunteer.uid,
          volunteerName: volunteer.name,
          source: "auto",
        });
      }
    }

    await donationRef.update(donationUpdate);
    await logAction(req.user, "donation.match", { type: "donation", id: req.params.id }, {
      category: donation.category,
      matchedRequestId: bestMatch.id,
      deliveryId,
    });

    return res.json({
      donationId: req.params.id,
      matchedRequestId: bestMatch.id,
      matchedRequestPriority: bestMatch.priorityScore,
      distanceKm: Math.round(bestMatch.distanceKm * 10) / 10,
      deliveryId,
      autoAssignedVolunteer,
    });
  } catch (err) {
    console.error("Match donation error:", err.message);
    return res.status(500).json({ error: "Failed to match donation.", details: err.message });
  }
});

module.exports = router;
