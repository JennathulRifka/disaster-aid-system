const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { getCategoryLimits } = require("../utils/categories");
const { computeOverallStatus } = require("../utils/requestItemStatus");
const { distanceKm } = require("../utils/geo");
const { nearestDistrict } = require("../utils/districts");
const { logAction } = require("../utils/auditLog");
const crypto = require("crypto");
const { findBestVolunteer, findVolunteerForDropoff, findVolunteerForRequest } = require("../utils/autoAssignVolunteer");
const { createChatForSelfDelivery } = require("../utils/deliveryChats");
const { sendNotificationToUser } = require("../utils/notifications");
const { logger } = require("../utils/logger");

const router = express.Router();

const REQUESTABLE_STATUSES = ["verified", "in_progress"];

/**
 * POST /api/donations
 * Donor registers a donation.
 * Body: { category, quantity, quantityValue, location: {lat, lng}, deliveryMethod: "self"|"volunteer", notes? }
 *
 * `quantity` stays the existing free-text display label ("50 kg rice") —
 * unchanged, so nothing that already reads/displays it needs to change.
 * `quantityValue` is new: a real number, the one field the district-inventory
 * feature actually needs (see "Donation leftover-quantity tracking &
 * district inventory" in CLAUDE.md for why free text alone can't support
 * remainder arithmetic). `remainingQuantity` starts equal to it and is only
 * ever decremented by POST /:id/match — never by anything else.
 */
router.post("/", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const { category, quantity, quantityValue, location, deliveryMethod, notes } = req.body;
    if (!category || !quantity || !location || !deliveryMethod) {
      return res.status(400).json({
        error: "category, quantity, location, and deliveryMethod are required.",
      });
    }
    const numericQuantity = Number(quantityValue);
    if (!quantityValue || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
      return res.status(400).json({ error: "quantityValue must be a positive number." });
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
      quantityValue: numericQuantity,
      remainingQuantity: numericQuantity,
      district: nearestDistrict(location),
      location,
      deliveryMethod,
      notes: notes || "",
      status: "available", // available -> matched -> delivered
      matchedRequestId: null,
      assignedDeliveryId: null,
      deliveryStatus: null,
      pendingAllocatedQuantity: null,
      // null here (not a generated id) — a single-item donation has nothing
      // to group with. See POST /batch below for the multi-category case
      // this field actually exists for.
      dropoffId: null,
      dropoffItemCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    const docRef = await db.collection("donations").add(donation);
    return res.status(201).json({ id: docRef.id, ...donation });
  } catch (err) {
    logger.error({ err }, "Create donation error");
    return res.status(500).json({ error: "Failed to create donation.", details: err.message });
  }
});

/**
 * POST /api/donations/batch
 * Donor registers several categories from one drop-off in a single call.
 * Body: { items: [{category, quantity, quantityValue}], location,
 *          deliveryMethod: "self"|"volunteer", notes? }
 *
 * Replaces the donor forms' previous approach of firing one POST / per
 * selected category (Promise.allSettled, partial-failure handling on the
 * client) — see "Multi-category donations" in CLAUDE.md for why donations
 * stayed single-category-per-document rather than growing an items[] array
 * like aidRequests. That's still true here: this still creates one donation
 * document per category, just atomically and with a shared `dropoffId`
 * (crypto.randomBytes, same convention as generateConfirmToken() in
 * deliveries.js) tagging them as one physical pickup.
 *
 * Written as a single Firestore batch() write — atomic, all-or-nothing —
 * which is a real improvement over the old per-category POST loop, not just
 * a grouping label: a category-cap violation on item 3 of 5 now fails the
 * whole submission cleanly instead of leaving 2 real donations behind that
 * the donor then has to notice and reconcile.
 *
 * `dropoffId` is why a volunteer picking up 3 items from one donor can see
 * they're linked (see "Donation batching" in CLAUDE.md) and why
 * auto-assignment (findVolunteerForDropoff, called from POST /:id/match
 * below) can keep the same volunteer across the whole batch instead of
 * independently recomputing nearest-available per category.
 */
router.post("/batch", requireAuth, requireRole("donor"), async (req, res) => {
  try {
    const { items, location, deliveryMethod, notes } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required." });
    }
    if (!location || !deliveryMethod) {
      return res.status(400).json({ error: "location and deliveryMethod are required." });
    }
    if (!["self", "volunteer"].includes(deliveryMethod)) {
      return res.status(400).json({ error: 'deliveryMethod must be "self" or "volunteer".' });
    }

    const categoryLimits = await getCategoryLimits();
    const seenCategories = new Set();
    for (const item of items) {
      if (!item?.category || !Object.keys(categoryLimits).includes(item.category)) {
        return res.status(400).json({ error: `"${item?.category}" is not a recognized category.` });
      }
      if (seenCategories.has(item.category)) {
        return res.status(400).json({ error: `"${item.category}" was selected more than once.` });
      }
      seenCategories.add(item.category);
      const numericQuantity = Number(item.quantityValue);
      if (!item.quantity || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
        return res.status(400).json({ error: `A valid quantity is required for "${item.category}".` });
      }
    }

    const dropoffId = crypto.randomBytes(8).toString("hex");
    const now = new Date().toISOString();
    const district = nearestDistrict(location);
    const batch = db.batch();
    const created = [];

    for (const item of items) {
      const donation = {
        donorId: req.user.uid,
        donorName: req.user.name,
        category: item.category,
        quantity: item.quantity,
        quantityValue: Number(item.quantityValue),
        remainingQuantity: Number(item.quantityValue),
        district,
        location,
        deliveryMethod,
        notes: notes || "",
        status: "available",
        matchedRequestId: null,
        assignedDeliveryId: null,
        deliveryStatus: null,
        pendingAllocatedQuantity: null,
        dropoffId,
        dropoffItemCount: items.length,
        createdAt: now,
        updatedAt: now,
      };
      const ref = db.collection("donations").doc();
      batch.set(ref, donation);
      created.push({ id: ref.id, ...donation });
    }

    await batch.commit();
    return res.status(201).json({ dropoffId, donations: created });
  } catch (err) {
    logger.error({ err }, "Create donation batch error");
    return res.status(500).json({ error: "Failed to create donations.", details: err.message });
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
    logger.error({ err }, "List donations error");
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
    logger.error({ err }, "List my donations error");
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

    // remainingQuantity is absent on donations created before this field
    // existed — treat missing as "whatever quantityValue says, or just let
    // it through" so old data isn't silently blocked from ever matching
    // again. donations created going forward always have both fields set
    // at creation (see POST / above).
    const remainingBefore = donation.remainingQuantity ?? donation.quantityValue ?? Infinity;
    if (remainingBefore <= 0) {
      return res.status(400).json({ error: "This donation has no remaining quantity left to match." });
    }

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

    // The request-side item is still all-or-nothing on purpose (deferred,
    // confirmed scope — see "Donation leftover-quantity tracking" in
    // CLAUDE.md): whichever pending item first matches this category gets
    // marked fully "matched" here regardless of whether this donation can
    // actually cover its full quantity. Only the DONATION's own remaining
    // balance is quantity-aware below.
    const matchedItem = bestMatch.items.find(
      (item) => item.category === donation.category && item.status === "pending"
    );
    const updatedItems = bestMatch.items.map((item) =>
      item === matchedItem ? { ...item, status: "matched", donationId: req.params.id } : item
    );
    const newRequestStatus = computeOverallStatus(updatedItems);

    await db.collection("aidRequests").doc(bestMatch.id).update({
      items: updatedItems,
      status: newRequestStatus,
      updatedAt: now,
    });

    // The actual leftover-tracking math: never consume more than the
    // donation actually has left, or more than this one request item
    // needs. Whichever is smaller is what this match actually uses; the
    // rest (if any) stays on the donation as remainingQuantity, and the
    // donation stays "available" — not "matched" — so it can be matched
    // again later for a different request (the user's explicit choice for
    // this feature, see CLAUDE.md).
    const neededByItem = Number(matchedItem?.quantity) || remainingBefore;
    const consumedQuantity = Math.min(remainingBefore, neededByItem);
    const remainingAfter = remainingBefore - consumedQuantity;

    const donationUpdate = {
      status: remainingAfter > 0 ? "available" : "matched",
      remainingQuantity: remainingAfter,
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
        allocatedQuantity: consumedQuantity,
        volunteerId: null,
        method: "self",
        status: "accepted", // self-delivery skips the volunteer accept step
        currentLocation: null,
        dropoffId: donation.dropoffId || null,
        donorName: donation.donorName,
        createdAt: now,
        updatedAt: now,
      };
      const deliveryRef = await db.collection("deliveries").add(delivery);
      deliveryId = deliveryRef.id;
      donationUpdate.assignedDeliveryId = deliveryId;
      donationUpdate.deliveryStatus = "accepted";
      await createChatForSelfDelivery(deliveryId, bestMatch.id, req.params.id, donation.donorId, bestMatch.victimId);
    } else {
      // Volunteer delivery — three-tier preference before falling back to
      // ordinary nearest-available matching:
      //  1. Another donation from the same physical drop-off (dropoffId)
      //     already has an active delivery — prefer that same volunteer
      //     (see findVolunteerForDropoff's own doc comment; the fix for a
      //     multi-category drop-off fragmenting across several volunteers
      //     who don't know about each other).
      //  2. Otherwise, another item on the SAME request (same victim, but
      //     from a different, unrelated donor) already has an active
      //     delivery — prefer that same volunteer too (see
      //     findVolunteerForRequest's own doc comment; the fix for one
      //     victim's multi-item request being scattered across several
      //     volunteers who each show up separately at the same household).
      //  3. Otherwise, ordinary nearest-available matching.
      // Leaves the donation unassigned (same as before this feature
      // existed) if nobody qualifies, so an admin can still assign manually
      // from AdminDonations.tsx. pendingAllocatedQuantity carries this
      // match's consumedQuantity forward so the manual-assign route (POST /
      // below) can attach the right allocatedQuantity once a delivery
      // finally gets created — the match itself already happened and
      // remainingQuantity is already decremented, so this value can't be
      // recomputed later from remainingQuantity alone.
      donationUpdate.pendingAllocatedQuantity = consumedQuantity;
      let assignSource = "auto";
      let volunteer = await findVolunteerForDropoff(donation.dropoffId, req.params.id);
      if (volunteer) {
        assignSource = "auto_dropoff";
      } else {
        volunteer = await findVolunteerForRequest(bestMatch.id, req.params.id);
        if (volunteer) {
          assignSource = "auto_request";
        } else {
          volunteer = await findBestVolunteer(donation.location);
        }
      }
      if (volunteer) {
        const delivery = {
          requestId: bestMatch.id,
          donationId: req.params.id,
          category: donation.category,
          allocatedQuantity: consumedQuantity,
          volunteerId: volunteer.uid,
          method: "volunteer",
          status: "pending_acceptance",
          currentLocation: null,
          dropoffId: donation.dropoffId || null,
          donorName: donation.donorName,
          createdAt: now,
          updatedAt: now,
        };
        const deliveryRef = await db.collection("deliveries").add(delivery);
        deliveryId = deliveryRef.id;
        donationUpdate.assignedDeliveryId = deliveryId;
        donationUpdate.deliveryStatus = "pending_acceptance";
        donationUpdate.pendingAllocatedQuantity = null; // consumed by the delivery we just created
        autoAssignedVolunteer = {
          id: volunteer.uid,
          name: volunteer.name,
          sameDropoff: assignSource === "auto_dropoff",
          sameRequest: assignSource === "auto_request",
        };
        await logAction(req.user, "delivery.assign", { type: "delivery", id: deliveryId }, {
          requestId: bestMatch.id,
          donationId: req.params.id,
          volunteerId: volunteer.uid,
          volunteerName: volunteer.name,
          source: assignSource,
        });
        await sendNotificationToUser(volunteer.uid, {
          title: "New delivery assignment",
          body: `You've been assigned a ${donation.category} delivery — accept or reject it from My Deliveries.`,
          data: { type: "delivery_assigned", deliveryId },
        });
      }
    }

    await donationRef.update(donationUpdate);
    await logAction(req.user, "donation.match", { type: "donation", id: req.params.id }, {
      category: donation.category,
      matchedRequestId: bestMatch.id,
      deliveryId,
      consumedQuantity,
      remainingQuantity: remainingAfter,
    });

    return res.json({
      donationId: req.params.id,
      matchedRequestId: bestMatch.id,
      matchedRequestPriority: bestMatch.priorityScore,
      distanceKm: Math.round(bestMatch.distanceKm * 10) / 10,
      deliveryId,
      autoAssignedVolunteer,
      consumedQuantity,
      remainingQuantity: remainingAfter,
    });
  } catch (err) {
    logger.error({ err }, "Match donation error");
    return res.status(500).json({ error: "Failed to match donation.", details: err.message });
  }
});

module.exports = router;
