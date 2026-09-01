const { db } = require("../config/firebase");
const { nearestDistrict } = require("./districts");
const { sendNotificationToUser } = require("./notifications");
const { sendSmsToUser } = require("./sms");

const ACTIVE_REQUEST_STATUSES = ["pending", "verified", "in_progress"];

// Ranked so a status *increase* (rising water) can be detected — de-escalation
// (water receding) updates the stored state but never sends an alert, since
// "rising water levels" was the specific thing asked for.
const STATUS_SEVERITY = { normal: 0, alert: 1, minor_flood: 2, major_flood: 3 };

const ALERT_MESSAGE = {
  alert: (station, basin) => `Water levels are rising near you — ${station} (${basin}) has reached alert level.`,
  minor_flood: (station, basin) =>
    `Minor flood level reached near you — ${station} (${basin}). Please stay alert and monitor official updates.`,
  major_flood: (station, basin) =>
    `Major flood level reached near you — ${station} (${basin}). Please take precautions and follow official guidance.`,
};

// Same ranked-escalation approach as river gauges, applied to reservoir
// storage % + the sheet's own "spilling" flag (see reservoirRiskLevel() in
// external.js) — describes current officially-published state only, never a
// prediction of when a gate might open.
const RESERVOIR_RISK_SEVERITY = { normal: 0, elevated: 1, high: 2, spilling: 3 };

const RESERVOIR_ALERT_MESSAGE = {
  elevated: (name, pct) =>
    `${name} reservoir is at ${pct}% capacity — water levels nearby may be rising. Stay alert for updates.`,
  high: (name, pct) =>
    `${name} reservoir is nearing full capacity (${pct}%) — please stay alert and monitor official updates.`,
  spilling: (name, pct) =>
    `${name} reservoir is spilling (${pct}% capacity) — downstream areas may see rising water. Please follow official guidance.`,
};

function slugify(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * Finds every victim with an active (pending/verified/in_progress) request
 * located in `district` — the same nearest-centroid matching already used by
 * /api/stats/by-area and the admin filters, so "which victims are in this
 * district" always means the same thing everywhere in this app. Dedupes by
 * victim in case someone has more than one active request.
 */
async function findVictimsInDistrict(district) {
  const snapshot = await db.collection("aidRequests").where("status", "in", ACTIVE_REQUEST_STATUSES).get();
  const victimIds = new Set();
  snapshot.docs.forEach((doc) => {
    const request = doc.data();
    if (!request.location) return;
    if (nearestDistrict(request.location) === district) victimIds.add(request.victimId);
  });
  return [...victimIds];
}

/**
 * Actually sends the notification to every matching victim and logs it to
 * `sentAreaAlerts` (the admin-visible history). Used both by the automatic
 * path (autoSend on) and by an admin approving a pending alert. Shared by
 * both hazard types this feature covers (river gauge escalations and
 * reservoir risk escalations) — `hazardType` picks which message builder and
 * identifying fields apply, but it's the same notify-and-log code either way.
 */
async function sendAreaAlert({
  hazardType = "gauge",
  station,
  basin,
  reservoir,
  district,
  status,
  waterLevel,
  effectiveStoragePercent,
  source,
  approvedBy = null,
}) {
  const victimIds = await findVictimsInDistrict(district);
  const body =
    hazardType === "reservoir"
      ? RESERVOIR_ALERT_MESSAGE[status](reservoir, effectiveStoragePercent)
      : ALERT_MESSAGE[status](station, basin);

  await Promise.all(
    victimIds.flatMap((uid) => [
      sendNotificationToUser(uid, {
        title: "Disaster alert for your area",
        body,
        data: { type: hazardType === "reservoir" ? "area.reservoir" : "area.water_level", district, status },
      }),
      sendSmsToUser(uid, body),
    ])
  );

  await db.collection("sentAreaAlerts").add({
    hazardType,
    station: station || null,
    basin: basin || null,
    reservoir: reservoir || null,
    district,
    status,
    waterLevel: waterLevel ?? null,
    effectiveStoragePercent: effectiveStoragePercent ?? null,
    message: body,
    notifiedCount: victimIds.length,
    source, // "auto" | "admin_approved"
    approvedBy,
    sentAt: new Date().toISOString(),
  });

  return { notifiedCount: victimIds.length };
}

/**
 * Runs on a timer (see server.js) and once at startup. Compares each gauge
 * station's current status against what it was last time this ran; a real
 * escalation (not just "still in alert status from before") either sends
 * immediately (autoSend on) or drops a pending item for admin review
 * (autoSend off, the safer default — see waterLevelAlertSettings).
 */
async function checkWaterLevelsAndAlert() {
  try {
    const { fetchWaterLevels } = require("../routes/external");
    const stations = await fetchWaterLevels();

    const settingsDoc = await db.collection("waterLevelAlertSettings").doc("config").get();
    const autoSend = settingsDoc.exists ? settingsDoc.data().autoSend === true : false;

    for (const gauge of stations) {
      if (gauge.status === "normal") {
        // Still record normal so a future rise is measured from the right baseline.
        await db
          .collection("waterLevelAlertState")
          .doc(slugify(gauge.station))
          .set({ station: gauge.station, lastStatus: "normal", updatedAt: new Date().toISOString() });
        continue;
      }

      const stateRef = db.collection("waterLevelAlertState").doc(slugify(gauge.station));
      const stateDoc = await stateRef.get();
      const lastStatus = stateDoc.exists ? stateDoc.data().lastStatus : "normal";

      const isEscalation = STATUS_SEVERITY[gauge.status] > STATUS_SEVERITY[lastStatus];

      if (isEscalation) {
        const district = nearestDistrict({ lat: gauge.lat, lng: gauge.lng });
        const alertData = {
          station: gauge.station,
          basin: gauge.basin,
          district,
          status: gauge.status,
          waterLevel: gauge.waterLevel,
        };

        if (autoSend) {
          await sendAreaAlert({ ...alertData, source: "auto" });
        } else {
          await db.collection("pendingAreaAlerts").add({
            ...alertData,
            message: ALERT_MESSAGE[gauge.status](gauge.station, gauge.basin),
            createdAt: new Date().toISOString(),
            resolved: false,
          });
        }
      }

      await stateRef.set({ station: gauge.station, lastStatus: gauge.status, updatedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error("Water level alert check failed:", err.message);
  }
}

/**
 * Same escalation-detection shape as checkWaterLevelsAndAlert(), applied to
 * reservoir risk level instead of gauge flood status. Shares the same
 * waterLevelAlertState collection (keyed with a "reservoir_" prefix so a
 * reservoir and a gauge can never collide on the same doc id) and the same
 * admin autoSend toggle — one detector feeding the one pending/sent pipeline,
 * rather than a second parallel alert system.
 */
async function checkReservoirsAndAlert() {
  try {
    const { fetchReservoirs } = require("../routes/external");
    const reservoirs = await fetchReservoirs();

    const settingsDoc = await db.collection("waterLevelAlertSettings").doc("config").get();
    const autoSend = settingsDoc.exists ? settingsDoc.data().autoSend === true : false;

    for (const reservoir of reservoirs) {
      const stateKey = `reservoir_${slugify(reservoir.name)}`;
      const stateRef = db.collection("waterLevelAlertState").doc(stateKey);

      if (reservoir.riskLevel === "normal") {
        await stateRef.set({ station: reservoir.name, lastStatus: "normal", updatedAt: new Date().toISOString() });
        continue;
      }

      const stateDoc = await stateRef.get();
      const lastStatus = stateDoc.exists ? stateDoc.data().lastStatus : "normal";
      const isEscalation = RESERVOIR_RISK_SEVERITY[reservoir.riskLevel] > RESERVOIR_RISK_SEVERITY[lastStatus];

      // No district on this reservoir's row (a handful of rows in the source
      // sheet have a blank District cell) means there's nobody to match
      // against — record state but don't attempt to alert.
      if (isEscalation && reservoir.district) {
        const alertData = {
          hazardType: "reservoir",
          reservoir: reservoir.name,
          district: reservoir.district,
          status: reservoir.riskLevel,
          effectiveStoragePercent: reservoir.effectiveStoragePercent,
        };

        if (autoSend) {
          await sendAreaAlert({ ...alertData, source: "auto" });
        } else {
          await db.collection("pendingAreaAlerts").add({
            ...alertData,
            message: RESERVOIR_ALERT_MESSAGE[reservoir.riskLevel](reservoir.name, reservoir.effectiveStoragePercent),
            createdAt: new Date().toISOString(),
            resolved: false,
          });
        }
      }

      await stateRef.set({ station: reservoir.name, lastStatus: reservoir.riskLevel, updatedAt: new Date().toISOString() });
    }
  } catch (err) {
    console.error("Reservoir alert check failed:", err.message);
  }
}

module.exports = { checkWaterLevelsAndAlert, checkReservoirsAndAlert, sendAreaAlert, STATUS_SEVERITY, RESERVOIR_RISK_SEVERITY };
