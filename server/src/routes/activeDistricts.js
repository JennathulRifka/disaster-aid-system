const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { DISTRICTS } = require("../utils/districts");
const { logAction } = require("../utils/auditLog");

const router = express.Router();
const COLLECTION = "activeDistricts";
const VALID_DISTRICTS = new Set(DISTRICTS.map((d) => d.name));

function slugify(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * GET /api/active-districts
 * Public — victims see this to know whether their district has a declared
 * emergency (informational only, never blocks submission — see
 * VictimRequestForm.tsx), and the public emergency banner shows it too.
 */
router.get("/", async (req, res) => {
  try {
    const snapshot = await db.collection(COLLECTION).get();
    const districts = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return res.json(districts);
  } catch (err) {
    console.error("List active districts error:", err.message);
    return res.status(500).json({ error: "Failed to list active districts.", details: err.message });
  }
});

/**
 * POST /api/active-districts
 * Admin: mark a specific district as an active emergency. Sri Lanka's
 * disasters are usually localized, so this is per-district, never a single
 * system-wide toggle. Idempotent — marking an already-active district just
 * refreshes it (e.g. with a newer sourceAlertTitle) rather than erroring.
 * Body: { district, sourceAlertTitle? }
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { district, sourceAlertTitle } = req.body;
    if (!district || !VALID_DISTRICTS.has(district)) {
      return res.status(400).json({ error: `district must be one of the 25 Sri Lankan districts.` });
    }

    const now = new Date().toISOString();
    const record = {
      district,
      activatedAt: now,
      activatedBy: req.user.uid,
      activatedByName: req.user.name,
      sourceAlertTitle: sourceAlertTitle || null,
    };
    await db.collection(COLLECTION).doc(slugify(district)).set(record);
    await logAction(req.user, "district.activate", { type: "district", id: district }, {
      district,
      sourceAlertTitle: sourceAlertTitle || null,
    });

    return res.status(201).json(record);
  } catch (err) {
    console.error("Activate district error:", err.message);
    return res.status(500).json({ error: "Failed to activate district.", details: err.message });
  }
});

/**
 * DELETE /api/active-districts/:district
 * Admin: clear the active-emergency flag for one district.
 */
router.delete("/:district", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection(COLLECTION).doc(slugify(req.params.district));
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "That district is not currently active." });

    await ref.delete();
    await logAction(req.user, "district.deactivate", { type: "district", id: doc.data().district }, {
      district: doc.data().district,
    });

    return res.json({ district: doc.data().district, active: false });
  } catch (err) {
    console.error("Deactivate district error:", err.message);
    return res.status(500).json({ error: "Failed to deactivate district.", details: err.message });
  }
});

module.exports = router;
