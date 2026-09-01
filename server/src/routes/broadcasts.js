const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();
const COLLECTION = "broadcasts";
const SEVERITIES = ["info", "warning", "critical"];

/**
 * GET /api/broadcasts/active
 * Public — the landing page and every dashboard poll this to know whether
 * to show a banner. Returns null when there's nothing active.
 */
router.get("/active", async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTION).where("active", "==", true).limit(1).get();
    if (snapshot.empty) return res.json(null);
    const doc = snapshot.docs[0];
    return res.json({ id: doc.id, ...doc.data() });
  } catch (err) {
    console.error("Get active broadcast error:", err.message);
    return res.status(500).json({ error: "Failed to load active broadcast.", details: err.message });
  }
});

/**
 * GET /api/broadcasts
 * Admin — history of all broadcasts, most recent first.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTION).orderBy("createdAt", "desc").limit(20).get();
    const broadcasts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(broadcasts);
  } catch (err) {
    console.error("List broadcasts error:", err.message);
    return res.status(500).json({ error: "Failed to list broadcasts.", details: err.message });
  }
});

/**
 * POST /api/broadcasts
 * Admin — posts a new banner. Only one broadcast is ever active at a time,
 * so this deactivates any currently-active one first.
 * Body: { message, severity: "info"|"warning"|"critical" }
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { message, severity } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ error: "message is required." });
    }
    const resolvedSeverity = severity || "warning";
    if (!SEVERITIES.includes(resolvedSeverity)) {
      return res.status(400).json({ error: `severity must be one of: ${SEVERITIES.join(", ")}` });
    }

    const now = new Date().toISOString();

    const activeSnapshot = await db.collection(COLLECTION).where("active", "==", true).get();
    const batch = db.batch();
    activeSnapshot.docs.forEach((doc) => {
      batch.update(doc.ref, { active: false, deactivatedAt: now });
    });

    const broadcast = {
      message: message.trim(),
      severity: resolvedSeverity,
      active: true,
      createdBy: req.user.uid,
      createdByName: req.user.name,
      createdAt: now,
      updatedAt: now,
      deactivatedAt: null,
    };
    const ref = db.collection(COLLECTION).doc();
    batch.set(ref, broadcast);

    await batch.commit();

    return res.status(201).json({ id: ref.id, ...broadcast });
  } catch (err) {
    console.error("Create broadcast error:", err.message);
    return res.status(500).json({ error: "Failed to create broadcast.", details: err.message });
  }
});

/**
 * PATCH /api/broadcasts/:id/deactivate
 * Admin — clears the banner without posting a replacement.
 */
router.patch("/:id/deactivate", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Broadcast not found." });

    const now = new Date().toISOString();
    await ref.update({ active: false, deactivatedAt: now, updatedAt: now });
    return res.json({ id: req.params.id, ...doc.data(), active: false, deactivatedAt: now, updatedAt: now });
  } catch (err) {
    console.error("Deactivate broadcast error:", err.message);
    return res.status(500).json({ error: "Failed to deactivate broadcast.", details: err.message });
  }
});

module.exports = router;
