const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { nearestDistrict } = require("../utils/districts");
const { logAction } = require("../utils/auditLog");

const router = express.Router();

const REPORT_TYPES = ["road_closure", "water_level", "other"];

/**
 * The crowdsourcing gap this project's own research critiqued Ushahidi for
 * not closing: reports that go nowhere. This is the "connect a report to
 * action" half — see PATCH /:id/verify below, which can promote a verified
 * report straight into an activeDistricts declaration, reusing the exact
 * infrastructure that already drives the public banner and the victim
 * request form's soft note.
 *
 * Restricted to volunteers (confirmed with the user directly rather than
 * opening it to every role) — a smaller, higher-trust reporting pool than
 * "anyone," trading coverage for less moderation burden on admins.
 */
router.post("/", requireAuth, requireRole("volunteer"), async (req, res) => {
  try {
    const { type, description, location } = req.body;
    if (!type || !REPORT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${REPORT_TYPES.join(", ")}` });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ error: "description is required." });
    }
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return res.status(400).json({ error: "location {lat, lng} is required." });
    }

    const now = new Date().toISOString();
    const report = {
      reporterId: req.user.uid,
      reporterName: req.user.name,
      type,
      description: description.trim(),
      location,
      district: nearestDistrict(location),
      status: "unverified", // unverified -> verified | dismissed
      createdAt: now,
      updatedAt: now,
      verifiedAt: null,
      verifiedBy: null,
    };

    const docRef = await db.collection("communityReports").add(report);
    return res.status(201).json({ id: docRef.id, ...report });
  } catch (err) {
    console.error("Create community report error:", err.message);
    return res.status(500).json({ error: "Failed to submit report.", details: err.message });
  }
});

/**
 * GET /api/community-reports
 * Admin: every report, unverified first (so nothing waits unnoticed), then
 * newest first within each group.
 */
router.get("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const snapshot = await db.collection("communityReports").get();
    const reports = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => {
        const aPending = a.status === "unverified" ? 0 : 1;
        const bPending = b.status === "unverified" ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return b.createdAt.localeCompare(a.createdAt);
      });
    return res.json(reports);
  } catch (err) {
    console.error("List community reports error:", err.message);
    return res.status(500).json({ error: "Failed to list reports.", details: err.message });
  }
});

/**
 * GET /api/community-reports/verified
 * Public. Only ever returns verified reports — this is what actually gets
 * shown to the public (severity map), so an unverified/false report never
 * reaches anyone before a human has checked it. No PII here (reporter name
 * is a volunteer, not a victim; location is public infrastructure
 * conditions — a road, a water level — never a private address).
 */
router.get("/verified", async (req, res) => {
  try {
    const snapshot = await db.collection("communityReports").where("status", "==", "verified").get();
    const reports = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt));
    return res.json(reports);
  } catch (err) {
    console.error("List verified reports error:", err.message);
    return res.status(500).json({ error: "Failed to list verified reports.", details: err.message });
  }
});

/**
 * PATCH /api/community-reports/:id/verify
 * Admin: approve or dismiss a report. Body: { approve: true|false, activateDistrict?: boolean }
 * Approving with activateDistrict also declares the report's district an
 * active emergency (same activeDistricts collection the DMC-alert quick
 * action and /admin/active-emergencies already write to) — this is the
 * concrete "connects to action" step, not just a status flip nobody sees.
 */
router.patch("/:id/verify", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { approve, activateDistrict } = req.body;
    const ref = db.collection("communityReports").doc(req.params.id);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Report not found." });
    const report = doc.data();

    const now = new Date().toISOString();
    const newStatus = approve ? "verified" : "dismissed";
    await ref.update({ status: newStatus, verifiedAt: now, verifiedBy: req.user.name, updatedAt: now });

    if (approve && activateDistrict && report.district) {
      const districtId = String(report.district).toLowerCase().replace(/[^a-z0-9]+/g, "_");
      await db
        .collection("activeDistricts")
        .doc(districtId)
        .set({
          district: report.district,
          activatedAt: now,
          activatedBy: req.user.uid,
          activatedByName: req.user.name,
          sourceAlertTitle: `Community report: ${report.description.slice(0, 80)}`,
        });
      await logAction(req.user, "district.activate", { type: "district", id: districtId }, {
        district: report.district,
        sourceAlertTitle: `Community report ${req.params.id}`,
      });
    }

    await logAction(req.user, approve ? "community_report.verify" : "community_report.dismiss", { type: "communityReport", id: req.params.id }, {
      reporterName: report.reporterName,
      reportType: report.type,
      district: report.district,
    });

    return res.json({ id: req.params.id, status: newStatus });
  } catch (err) {
    console.error("Verify community report error:", err.message);
    return res.status(500).json({ error: "Failed to verify report.", details: err.message });
  }
});

module.exports = router;
