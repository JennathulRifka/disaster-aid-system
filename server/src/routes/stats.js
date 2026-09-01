const express = require("express");
const { db } = require("../config/firebase");
const { DISTRICTS, nearestDistrict } = require("../utils/districts");
const { getCached } = require("../utils/cache");

const router = express.Router();

const ACTIVE_STATUSES = ["pending", "verified", "in_progress"];
const SEVERITY_WEIGHT = { low: 1, medium: 2, high: 3, critical: 4 };
// A concurrent-load test surfaced these as full, uncached collection scans
// on every call — under 50 simultaneous requests, p95 latency hit ~11s.
// Both endpoints are already one-time fetches on page load (not live
// onSnapshot listeners), so a short cache is invisible to normal use but
// absorbs a burst without re-scanning the whole collection each time.
const STATS_CACHE_TTL_MS = 30_000;

/**
 * Buckets a district's current need into a coarse level for map coloring.
 * Placeholder judgment call, like the category caps — combines both how
 * many active requests are concentrated there and how severe they are on
 * average, so one critical request doesn't outrank five moderate ones.
 */
function severityLevel(avgSeverity, count) {
  if (count === 0) return "none";
  if (avgSeverity >= 3 || count >= 5) return "high";
  if (avgSeverity >= 2 || count >= 2) return "moderate";
  return "low";
}

/**
 * GET /api/stats
 * Public endpoint (no auth) powering the transparency dashboard.
 * Returns aggregate counts only — never individual request details,
 * matching the privacy design in the dissertation's ethical considerations.
 */
router.get("/", async (req, res) => {
  try {
    const stats = await getCached("stats-overview", STATS_CACHE_TTL_MS, async () => {
      const [requestsSnap, donationsSnap, deliveriesSnap, volunteersSnap] = await Promise.all([
        db.collection("aidRequests").get(),
        db.collection("donations").get(),
        db.collection("deliveries").get(),
        db.collection("users").where("role", "==", "volunteer").get(),
      ]);

      const requests = requestsSnap.docs.map((d) => d.data());
      const donations = donationsSnap.docs.map((d) => d.data());
      const deliveries = deliveriesSnap.docs.map((d) => d.data());

      const countBy = (items, field) =>
        items.reduce((acc, item) => {
          const key = item[field] || "unknown";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {});

      const districtsReached = new Set(
        requests.filter((r) => r.location).map((r) => nearestDistrict(r.location))
      ).size;

      return {
        totalRequests: requests.length,
        requestsByStatus: countBy(requests, "status"),
        requestsByDisasterType: countBy(requests, "disasterType"),
        totalDonations: donations.length,
        donationsByStatus: countBy(donations, "status"),
        totalDeliveries: deliveries.length,
        deliveriesByStatus: countBy(deliveries, "status"),
        completedDeliveries: deliveries.filter((d) => d.status === "confirmed").length,
        totalVolunteers: volunteersSnap.size,
        districtsReached,
      };
    });

    return res.json(stats);
  } catch (err) {
    console.error("Stats error:", err.message);
    return res.status(500).json({ error: "Failed to load stats.", details: err.message });
  }
});

/**
 * GET /api/stats/by-area
 * Public endpoint (no auth) powering the public severity map.
 * Aggregates ACTIVE requests by nearest district — count + average severity
 * only. Never returns a raw victim location, name, or any per-request
 * detail; that's the whole point of this endpoint existing separately from
 * the admin-only /admin/map data.
 */
router.get("/by-area", async (req, res) => {
  try {
    const areas = await getCached("stats-by-area", STATS_CACHE_TTL_MS, async () => {
      const snapshot = await db.collection("aidRequests").where("status", "in", ACTIVE_STATUSES).get();

      const byDistrict = {};
      snapshot.docs.forEach((doc) => {
        const request = doc.data();
        if (!request.location) return;
        const district = nearestDistrict(request.location);
        if (!byDistrict[district]) byDistrict[district] = { count: 0, severitySum: 0 };
        byDistrict[district].count += 1;
        byDistrict[district].severitySum += SEVERITY_WEIGHT[request.severity] || 0;
      });

      return Object.entries(byDistrict).map(([district, { count, severitySum }]) => {
        const avgSeverity = severitySum / count;
        const centroid = DISTRICTS.find((d) => d.name === district);
        return {
          district,
          lat: centroid.lat,
          lng: centroid.lng,
          requestCount: count,
          avgSeverity: Math.round(avgSeverity * 10) / 10,
          level: severityLevel(avgSeverity, count),
        };
      });
    });

    return res.json(areas);
  } catch (err) {
    console.error("Stats by-area error:", err.message);
    return res.status(500).json({ error: "Failed to load area stats.", details: err.message });
  }
});

module.exports = router;
