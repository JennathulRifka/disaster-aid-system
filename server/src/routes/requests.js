const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { calculatePriorityScore } = require("../utils/priorityScore");
const { getCategoryLimits } = require("../utils/categories");
const { logAction } = require("../utils/auditLog");
const { sendNotificationToUser } = require("../utils/notifications");
const { sendSmsToUser } = require("../utils/sms");

const router = express.Router();

const ACTIVE_STATUSES = ["pending", "verified", "in_progress"];

function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeNic(nic) {
  return String(nic || "").trim().toUpperCase();
}

function validateItems(items, categoryLimits) {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one requested item is required.";
  }

  const seenCategories = new Set();
  for (const item of items) {
    const limit = categoryLimits[item?.category];
    if (!limit) {
      return `"${item?.category}" is not a recognized category.`;
    }
    if (seenCategories.has(item.category)) {
      return `"${item.category}" was requested more than once — combine it into a single line.`;
    }
    seenCategories.add(item.category);

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return `Quantity for "${item.category}" must be a positive number.`;
    }
    if (limit.max !== null && quantity > limit.max) {
      return `"${limit.label}" is capped at ${limit.max} ${limit.unit} per request.`;
    }
  }
  return null;
}

/**
 * Fraud signal, not a gate: a household submitting a second active request
 * (same NIC or same home address) gets flagged for a human to look at,
 * rather than blocked outright — legitimate households can have evolving
 * needs, and multi-category requests already reduce the reason to
 * double-submit.
 */
async function checkPossibleDuplicate(nic, homeAddress) {
  const checks = [];
  if (nic) {
    checks.push(
      db.collection("aidRequests").where("victimNic", "==", nic).where("status", "in", ACTIVE_STATUSES).limit(1).get()
    );
  }
  if (homeAddress) {
    checks.push(
      db
        .collection("aidRequests")
        .where("victimHomeAddress", "==", homeAddress)
        .where("status", "in", ACTIVE_STATUSES)
        .limit(1)
        .get()
    );
  }
  if (checks.length === 0) return false;
  const results = await Promise.all(checks);
  return results.some((snap) => !snap.empty);
}

/**
 * POST /api/requests
 * Victim submits a new aid request.
 * Body: { disasterType, items: [{category, quantity}], severity, peopleAffected, vulnerableGroups, location: {lat, lng}, notes? }
 */
router.post("/", requireAuth, requireRole("victim"), async (req, res) => {
  try {
    const { disasterType, items, severity, peopleAffected, vulnerableGroups, location, notes } = req.body;

    if (!disasterType || !severity || !location) {
      return res.status(400).json({
        error: "disasterType, severity, and location are required.",
      });
    }

    const categoryLimits = await getCategoryLimits();
    const itemsError = validateItems(items, categoryLimits);
    if (itemsError) {
      return res.status(400).json({ error: itemsError });
    }

    const normalizedNic = req.user.nic ? normalizeNic(req.user.nic) : null;
    const normalizedAddress = req.user.homeAddress ? normalizeAddress(req.user.homeAddress) : null;
    const possibleDuplicate = await checkPossibleDuplicate(normalizedNic, normalizedAddress);

    const now = new Date().toISOString();

    const requestData = {
      victimId: req.user.uid,
      victimName: req.user.name,
      victimNic: normalizedNic,
      victimHomeAddress: normalizedAddress,
      possibleDuplicate,
      disasterType,
      items: items.map((item) => ({
        category: item.category,
        quantity: Number(item.quantity),
        unit: categoryLimits[item.category].unit,
        status: "pending", // pending -> matched -> delivered
        donationId: null,
      })),
      severity,
      peopleAffected: peopleAffected || 1,
      vulnerableGroups: vulnerableGroups || [],
      location,
      notes: notes || "",
      status: "pending", // pending -> verified -> rejected | in_progress -> delivered
      createdAt: now,
      updatedAt: now,
    };
    requestData.requestedCategories = requestData.items.map((item) => item.category);

    const priority = calculatePriorityScore(requestData);
    requestData.priorityScore = priority.total;
    requestData.priorityBreakdown = priority.breakdown;

    const docRef = await db.collection("aidRequests").add(requestData);

    return res.status(201).json({ id: docRef.id, ...requestData });
  } catch (err) {
    console.error("Create request error:", err.message);
    return res.status(500).json({ error: "Failed to create request.", details: err.message });
  }
});

/**
 * GET /api/requests
 * Admin: list all requests, sorted by priority score (highest first).
 * Optional query param: ?status=pending
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    let query = db.collection("aidRequests");
    if (req.query.status) {
      query = query.where("status", "==", req.query.status);
    }
    const snapshot = await query.get();
    const requests = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));

    return res.json(requests);
  } catch (err) {
    console.error("List requests error:", err.message);
    return res.status(500).json({ error: "Failed to list requests.", details: err.message });
  }
});

/**
 * GET /api/requests/mine
 * Victim: list their own submitted requests.
 */
router.get("/mine", requireAuth, requireRole("victim"), async (req, res) => {
  try {
    const snapshot = await db.collection("aidRequests").where("victimId", "==", req.user.uid).get();
    const requests = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(requests);
  } catch (err) {
    console.error("List my requests error:", err.message);
    return res.status(500).json({ error: "Failed to list your requests.", details: err.message });
  }
});

/**
 * PATCH /api/requests/:id/verify
 * Admin approves or rejects a pending request.
 * Body: { approve: true|false }
 */
router.patch("/:id/verify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { approve } = req.body;
    const newStatus = approve ? "verified" : "rejected";

    const ref = db.collection("aidRequests").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Request not found." });

    const now = new Date().toISOString();
    const update = { status: newStatus, updatedAt: now };
    // Set once, on first approval — powers the admin dashboard's average
    // time-to-verification KPI. Never overwritten on a later re-verify.
    if (approve && !doc.data().verifiedAt) update.verifiedAt = now;

    await ref.update(update);
    await logAction(req.user, approve ? "request.approve" : "request.reject", { type: "request", id: req.params.id }, {
      victimName: doc.data().victimName,
    });

    if (approve) {
      await sendNotificationToUser(doc.data().victimId, {
        title: "Your aid request has been approved",
        body: "An admin has verified your request — we'll match it to a donation as soon as one is available.",
        data: { type: "request.verified", requestId: req.params.id },
      });
      await sendSmsToUser(
        doc.data().victimId,
        "Your aid request has been approved. We'll match it to a donation as soon as one is available."
      );
    }

    return res.json({ id: req.params.id, status: newStatus });
  } catch (err) {
    console.error("Verify request error:", err.message);
    return res.status(500).json({ error: "Failed to verify request.", details: err.message });
  }
});

/**
 * PATCH /api/requests/bulk-verify
 * Admin approves or rejects several pending requests at once — for a real
 * surge, going row-by-row doesn't scale. Silently skips any id that doesn't
 * exist rather than failing the whole batch over one bad id.
 * Body: { ids: string[], approve: true|false }
 */
router.patch("/bulk-verify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { ids, approve } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids must be a non-empty array." });
    }

    const newStatus = approve ? "verified" : "rejected";
    const refs = ids.map((id) => db.collection("aidRequests").doc(id));
    const docs = await Promise.all(refs.map((ref) => ref.get()));

    const now = new Date().toISOString();
    const batch = db.batch();
    const updated = [];
    const skipped = [];

    docs.forEach((doc, i) => {
      if (doc.exists) {
        const update = { status: newStatus, updatedAt: now };
        if (approve && !doc.data().verifiedAt) update.verifiedAt = now;
        batch.update(refs[i], update);
        updated.push(ids[i]);
      } else {
        skipped.push(ids[i]);
      }
    });

    if (updated.length > 0) {
      await batch.commit();
      await logAction(req.user, approve ? "request.bulk_approve" : "request.bulk_reject", { type: "request", id: null }, {
        ids: updated,
        count: updated.length,
      });

      if (approve) {
        await Promise.all(
          docs
            .filter((doc) => doc.exists && updated.includes(doc.id))
            .flatMap((doc) => [
              sendNotificationToUser(doc.data().victimId, {
                title: "Your aid request has been approved",
                body: "An admin has verified your request — we'll match it to a donation as soon as one is available.",
                data: { type: "request.verified", requestId: doc.id },
              }),
              sendSmsToUser(
                doc.data().victimId,
                "Your aid request has been approved. We'll match it to a donation as soon as one is available."
              ),
            ])
        );
      }
    }

    return res.json({ status: newStatus, updated, skipped });
  } catch (err) {
    console.error("Bulk verify error:", err.message);
    return res.status(500).json({ error: "Failed to bulk-verify requests.", details: err.message });
  }
});

/**
 * PATCH /api/requests/:id/status
 * General status override (rarely needed now that item-level status drives
 * the overall status automatically — kept for manual admin corrections).
 * Body: { status }
 */
router.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) return res.status(400).json({ error: "status is required." });

    const ref = db.collection("aidRequests").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Request not found." });

    await ref.update({ status, updatedAt: new Date().toISOString() });
    return res.json({ id: req.params.id, status });
  } catch (err) {
    console.error("Update status error:", err.message);
    return res.status(500).json({ error: "Failed to update status.", details: err.message });
  }
});

/**
 * GET /api/requests/:id/notes
 * Admin: internal case-note thread for a single request — handoff context
 * between admins (e.g. "called the victim, access road is passable"),
 * separate from the public emergency broadcast banner. Chronological order.
 */
router.get("/:id/notes", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const requestDoc = await db.collection("aidRequests").doc(req.params.id).get();
    if (!requestDoc.exists) return res.status(404).json({ error: "Request not found." });

    const snapshot = await db.collection("caseNotes").where("requestId", "==", req.params.id).get();
    const notes = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return res.json(notes);
  } catch (err) {
    console.error("List case notes error:", err.message);
    return res.status(500).json({ error: "Failed to list case notes.", details: err.message });
  }
});

/**
 * POST /api/requests/:id/notes
 * Admin: add a case note to a request. Notes are append-only — no edit or
 * delete, so the handoff trail stays trustworthy.
 * Body: { text }
 */
router.post("/:id/notes", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: "text is required." });
    }

    const requestDoc = await db.collection("aidRequests").doc(req.params.id).get();
    if (!requestDoc.exists) return res.status(404).json({ error: "Request not found." });

    const note = {
      requestId: req.params.id,
      authorId: req.user.uid,
      authorName: req.user.name,
      text: text.trim(),
      createdAt: new Date().toISOString(),
    };
    const docRef = await db.collection("caseNotes").add(note);

    return res.status(201).json({ id: docRef.id, ...note });
  } catch (err) {
    console.error("Create case note error:", err.message);
    return res.status(500).json({ error: "Failed to create case note.", details: err.message });
  }
});

module.exports = router;
