const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { DISTRICTS } = require("../utils/districts");
const { logAction } = require("../utils/auditLog");
const { findVictimsInDistrict } = require("../utils/waterLevelAlerts");
const { sendNotificationToUser } = require("../utils/notifications");

const router = express.Router();
const COLLECTION = "activeDistricts";
const VALID_DISTRICTS = new Set(DISTRICTS.map((d) => d.name));

function slugify(name) {
  return String(name || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

/**
 * Notifies every victim with an active request in `district` the moment it's
 * declared an active emergency — reuses the exact same district-matching
 * logic already built for water-level/reservoir area alerts
 * (findVictimsInDistrict, in waterLevelAlerts.js): a victim's "location" only
 * ever exists via their own request, there's no separate profile-level
 * location for victims to match against. FCM only, deliberately no SMS —
 * unlike the already-wired water/reservoir alert triggers (which the user
 * explicitly approved spending SMS quota on), this is a new trigger point
 * that fires on every district activation across all 25 districts, and this
 * project's standing rule is that spending real Text.lk quota on a new
 * trigger needs its own deliberate go-ahead, not an assumed extension.
 * Exported (attached to the router, same "Express Router instances are just
 * functions" convention as waterLevelAlerts.js's router.fetchWaterLevels) so
 * the community-reports promotion path (communityReports.js's own direct
 * write to this same collection) can fire the identical notification rather
 * than silently skipping it just because it didn't come through this route.
 *
 * `activatedByUid`, when given, also gets a confirmation notification of
 * their own — direct user ask: an admin who declares an emergency has no
 * other way to know the broadcast actually reached anyone, short of
 * trusting the API response. This is deliberately a *separate* notification
 * from the victim-facing one (different title/body), sent to exactly one
 * person (the admin who acted), not fanned out like the victim list above.
 */
async function notifyDistrictActivated(district, activatedByUid) {
  const victimIds = await findVictimsInDistrict(district);
  await Promise.all(
    victimIds.map((uid) =>
      sendNotificationToUser(uid, {
        title: "Active emergency declared",
        body: `An active emergency has been declared in ${district}. Stay alert and follow official guidance.`,
        data: { type: "district_activated", district },
      })
    )
  );
  if (activatedByUid) {
    await sendNotificationToUser(activatedByUid, {
      title: "Emergency broadcast sent",
      body: `Active emergency declared in ${district} — ${victimIds.length} victim${
        victimIds.length === 1 ? "" : "s"
      } notified.`,
      data: { type: "district_activation_confirmed", district },
    });
  }
  return victimIds.length;
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
    const notifiedCount = await notifyDistrictActivated(district, req.user.uid);

    return res.status(201).json({ ...record, notifiedCount });
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

router.notifyDistrictActivated = notifyDistrictActivated;
module.exports = router;
