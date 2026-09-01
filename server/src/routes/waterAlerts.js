const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { sendAreaAlert } = require("../utils/waterLevelAlerts");
const { logAction } = require("../utils/auditLog");

const router = express.Router();

/**
 * GET /api/water-alerts/settings
 * Admin: whether a rising-water-level escalation notifies victims
 * immediately (autoSend true) or waits for an admin to approve it first
 * (false — the default, same "suggestion, not automatic switch" pattern
 * already used for DMC alerts feeding active-district declarations).
 */
router.get("/settings", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const doc = await db.collection("waterLevelAlertSettings").doc("config").get();
    return res.json({ autoSend: doc.exists ? doc.data().autoSend === true : false });
  } catch (err) {
    console.error("Get water alert settings error:", err.message);
    return res.status(500).json({ error: "Failed to load settings.", details: err.message });
  }
});

/**
 * PATCH /api/water-alerts/settings
 * Admin: flip the auto-send toggle. Body: { autoSend: boolean }
 */
router.patch("/settings", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { autoSend } = req.body;
    if (typeof autoSend !== "boolean") {
      return res.status(400).json({ error: "autoSend must be true or false." });
    }

    await db
      .collection("waterLevelAlertSettings")
      .doc("config")
      .set({ autoSend, updatedAt: new Date().toISOString(), updatedBy: req.user.name }, { merge: true });

    return res.json({ autoSend });
  } catch (err) {
    console.error("Update water alert settings error:", err.message);
    return res.status(500).json({ error: "Failed to update settings.", details: err.message });
  }
});

/**
 * GET /api/water-alerts/pending
 * Admin: unresolved area-alert suggestions waiting for a decision (only
 * exists when autoSend is off — see checkWaterLevelsAndAlert).
 */
router.get("/pending", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("pendingAreaAlerts").where("resolved", "==", false).get();
    const pending = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return res.json(pending);
  } catch (err) {
    console.error("List pending area alerts error:", err.message);
    return res.status(500).json({ error: "Failed to list pending alerts.", details: err.message });
  }
});

/**
 * POST /api/water-alerts/pending/:id/approve
 * Admin: send the suggested alert now to every victim in the matched
 * district, and record it in the sent-alerts history.
 */
router.post("/pending/:id/approve", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("pendingAreaAlerts").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Pending alert not found." });
    const pending = doc.data();
    if (pending.resolved) return res.status(400).json({ error: "This alert has already been resolved." });

    const { notifiedCount } = await sendAreaAlert({
      hazardType: pending.hazardType || "gauge",
      station: pending.station,
      basin: pending.basin,
      reservoir: pending.reservoir,
      district: pending.district,
      status: pending.status,
      waterLevel: pending.waterLevel,
      effectiveStoragePercent: pending.effectiveStoragePercent,
      source: "admin_approved",
      approvedBy: req.user.name,
    });

    await ref.update({ resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: req.user.name, action: "approved" });
    await logAction(req.user, "area_alert.approve", { type: "pendingAreaAlert", id: req.params.id }, {
      district: pending.district,
      station: pending.station || pending.reservoir,
      notifiedCount,
    });

    return res.json({ id: req.params.id, status: "approved", notifiedCount });
  } catch (err) {
    console.error("Approve area alert error:", err.message);
    return res.status(500).json({ error: "Failed to approve alert.", details: err.message });
  }
});

/**
 * POST /api/water-alerts/pending/:id/reject
 * Admin: dismiss a suggested alert without notifying anyone.
 */
router.post("/pending/:id/reject", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection("pendingAreaAlerts").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Pending alert not found." });
    if (doc.data().resolved) return res.status(400).json({ error: "This alert has already been resolved." });

    await ref.update({ resolved: true, resolvedAt: new Date().toISOString(), resolvedBy: req.user.name, action: "rejected" });
    await logAction(req.user, "area_alert.reject", { type: "pendingAreaAlert", id: req.params.id }, {
      district: doc.data().district,
      station: doc.data().station || doc.data().reservoir,
    });

    return res.json({ id: req.params.id, status: "rejected" });
  } catch (err) {
    console.error("Reject area alert error:", err.message);
    return res.status(500).json({ error: "Failed to reject alert.", details: err.message });
  }
});

/**
 * GET /api/water-alerts/sent
 * Admin: history of alerts that actually went out (auto or admin-approved),
 * most recent first — last 50.
 */
router.get("/sent", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("sentAreaAlerts").get();
    const sent = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.sentAt.localeCompare(a.sentAt))
      .slice(0, 50);
    return res.json(sent);
  } catch (err) {
    console.error("List sent area alerts error:", err.message);
    return res.status(500).json({ error: "Failed to list sent alerts.", details: err.message });
  }
});

module.exports = router;
