const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth } = require("../middleware/authMiddleware");
const { logger } = require("../utils/logger");

const router = express.Router();

/**
 * GET /api/notifications/mine
 * Every notification recorded for the caller, most recent first. Filters on
 * `uid` only and sorts by `createdAt` in JS rather than adding `.orderBy()`
 * to the query — the same composite-index-avoidance convention used
 * throughout this app (see "Internal case notes" in CLAUDE.md) for a
 * single-equality-filter-plus-sort query.
 */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const snapshot = await db.collection("notifications").where("uid", "==", req.user.uid).get();
    const notifications = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 50);
    return res.json(notifications);
  } catch (err) {
    logger.error({ err }, "List notifications error");
    return res.status(500).json({ error: "Failed to load notifications.", details: err.message });
  }
});

/**
 * PATCH /api/notifications/:id/read
 * Marks one notification as read. Ownership-checked — a notification is
 * personal, never another user's to mark.
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
  try {
    const ref = db.collection("notifications").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Notification not found." });
    if (doc.data().uid !== req.user.uid) {
      return res.status(403).json({ error: "This isn't your notification." });
    }
    await ref.update({ read: true });
    return res.json({ status: "ok" });
  } catch (err) {
    logger.error({ err }, "Mark notification read error");
    return res.status(500).json({ error: "Failed to update notification.", details: err.message });
  }
});

/**
 * PATCH /api/notifications/mark-all-read
 * Bulk convenience for "clear the unread badge" — one batch write rather
 * than N round trips from the client.
 */
router.patch("/mark-all-read", requireAuth, async (req, res) => {
  try {
    const snapshot = await db
      .collection("notifications")
      .where("uid", "==", req.user.uid)
      .where("read", "==", false)
      .get();
    const batch = db.batch();
    snapshot.docs.forEach((doc) => batch.update(doc.ref, { read: true }));
    await batch.commit();
    return res.json({ status: "ok", updated: snapshot.size });
  } catch (err) {
    logger.error({ err }, "Mark all notifications read error");
    return res.status(500).json({ error: "Failed to update notifications.", details: err.message });
  }
});

module.exports = router;
