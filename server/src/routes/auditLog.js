const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");

const router = express.Router();

/**
 * GET /api/audit-log
 * Admin: the last 100 logged actions (approve/reject, bulk approve/reject,
 * donation match, volunteer assign), most recent first. A single-field
 * orderBy with no other filter doesn't need a composite index, unlike the
 * case-notes lookup — see "Internal case notes" in CLAUDE.md.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("auditLog").orderBy("createdAt", "desc").limit(100).get();
    const entries = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(entries);
  } catch (err) {
    console.error("List audit log error:", err.message);
    return res.status(500).json({ error: "Failed to list audit log.", details: err.message });
  }
});

module.exports = router;
