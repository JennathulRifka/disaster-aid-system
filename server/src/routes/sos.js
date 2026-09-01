const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { sendNotificationToUser } = require("../utils/notifications");
const { logAction } = require("../utils/auditLog");

const router = express.Router();

const SOS_TYPES = ["trapped", "missing_person", "flood_rescue", "other"];
const STATUS_FLOW = ["pending", "acknowledged", "in_progress", "resolved"];

/**
 * Separate from aidRequests entirely — "trapped" / "missing person" / "flood
 * rescue" is a life-safety emergency needing immediate attention, not a
 * multi-category resource request scored by the same priority algorithm as
 * "I need food." Deliberately minimal-friction: type + location is enough to
 * submit, everything else is optional. Any authenticated role can report one
 * (not just "victim") — someone could be reporting on behalf of another
 * person they've spotted in danger, not only themselves.
 */
router.post("/", requireAuth, async (req, res) => {
  try {
    const { type, location, peopleCount, description } = req.body;
    if (!type || !SOS_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${SOS_TYPES.join(", ")}` });
    }
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return res.status(400).json({ error: "location {lat, lng} is required." });
    }

    const now = new Date().toISOString();
    const sos = {
      reporterId: req.user.uid,
      reporterName: req.user.name,
      reporterPhone: req.user.phone || null,
      type,
      peopleCount: peopleCount != null ? Number(peopleCount) : null,
      description: description ? String(description).trim() : "",
      location,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      acknowledgedAt: null,
      resolvedAt: null,
    };

    const docRef = await db.collection("sosRequests").add(sos);

    // Every admin gets pushed immediately — this is the one place in the app
    // where "someone should see this in seconds" is the actual requirement,
    // not "eventually shows up in a queue."
    const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
    await Promise.all(
      adminsSnap.docs.map((doc) =>
        sendNotificationToUser(doc.id, {
          title: "🆘 New SOS report",
          body: `${sos.reporterName} reported "${type.replace("_", " ")}" — check the dispatch board now.`,
          data: { type: "sos.new", sosId: docRef.id },
        })
      )
    );

    return res.status(201).json({ id: docRef.id, ...sos });
  } catch (err) {
    console.error("Create SOS error:", err.message);
    return res.status(500).json({ error: "Failed to submit SOS.", details: err.message });
  }
});

/**
 * GET /api/sos
 * Admin: every SOS report, unresolved ones first (then newest first within
 * each group) — the dispatch board should never bury an active emergency
 * under old resolved ones just because of timestamp order.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("sosRequests").get();
    const reports = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aResolved = a.status === "resolved" ? 1 : 0;
        const bResolved = b.status === "resolved" ? 1 : 0;
        if (aResolved !== bResolved) return aResolved - bResolved;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return res.json(reports);
  } catch (err) {
    console.error("List SOS error:", err.message);
    return res.status(500).json({ error: "Failed to list SOS reports.", details: err.message });
  }
});

/**
 * GET /api/sos/mine
 * Any authed user: their own SOS reports, so they can see it's being handled
 * without needing admin access.
 */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection("sosRequests").where("reporterId", "==", req.user.uid).get();
    const reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(reports);
  } catch (err) {
    console.error("List my SOS error:", err.message);
    return res.status(500).json({ error: "Failed to list your SOS reports.", details: err.message });
  }
});

/**
 * PATCH /api/sos/:id/status
 * Admin: move a report through pending -> acknowledged -> in_progress ->
 * resolved. Status-only, deliberately not wired into the volunteer/delivery
 * pipeline — dispatching a rescue isn't "deliver goods," it's coordinated
 * outside this app (real responders, phone calls); this just tracks where
 * things stand. Notifies the original reporter on every change so they know
 * help is coming without needing to refresh anything.
 * Body: { status }
 */
router.patch("/:id/status", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { status } = req.body;
    if (!STATUS_FLOW.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${STATUS_FLOW.join(", ")}` });
    }

    const ref = db.collection("sosRequests").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "SOS report not found." });
    const sos = doc.data();

    const now = new Date().toISOString();
    const update = { status, updatedAt: now };
    if (status === "acknowledged" && !sos.acknowledgedAt) update.acknowledgedAt = now;
    if (status === "resolved" && !sos.resolvedAt) update.resolvedAt = now;

    await ref.update(update);
    await logAction(req.user, "sos.status_update", { type: "sos", id: req.params.id }, {
      reporterName: sos.reporterName,
      sosType: sos.type,
      newStatus: status,
    });

    const STATUS_COPY = {
      acknowledged: "An admin has seen your SOS report and is coordinating a response.",
      in_progress: "Help is on the way for your SOS report.",
      resolved: "Your SOS report has been marked resolved.",
    };
    if (STATUS_COPY[status]) {
      await sendNotificationToUser(sos.reporterId, {
        title: "Update on your SOS report",
        body: STATUS_COPY[status],
        data: { type: "sos.status", sosId: req.params.id, status },
      });
    }

    return res.json({ id: req.params.id, status });
  } catch (err) {
    console.error("Update SOS status error:", err.message);
    return res.status(500).json({ error: "Failed to update SOS status.", details: err.message });
  }
});

module.exports = router;
