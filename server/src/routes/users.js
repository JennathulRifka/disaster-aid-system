const express = require("express");
const { db, admin } = require("../config/firebase");
const { requireAuth } = require("../middleware/authMiddleware");
const { normalizeSriLankanPhone } = require("../utils/phone");

const router = express.Router();

const VALID_ROLES = ["victim", "donor", "volunteer", "admin"];

function normalizeNic(nic) {
  return String(nic || "").trim().toUpperCase();
}

/**
 * POST /api/users/profile
 * Called once, right after the frontend registers the user with Firebase Auth.
 * Creates (or updates) that user's profile document in Firestore.
 * Body: { role, name, phone, location?, nic?, homeAddress? }
 * nic and homeAddress are required for role "victim" — used to block
 * duplicate accounts / duplicate requests from the same household.
 */
router.post("/profile", async (req, res) => {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.split("Bearer ")[1] : null;
    if (!token) return res.status(401).json({ error: "Missing Authorization header." });

    const { auth } = require("../config/firebase");
    const decoded = await auth.verifyIdToken(token);

    const { role, name, phone, location, nic, homeAddress } = req.body;

    if (!role || !VALID_ROLES.includes(role)) {
      return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(", ")}` });
    }
    if (!name) {
      return res.status(400).json({ error: "name is required." });
    }

    // Phone stays optional overall, but a value that IS provided must be a
    // real Sri Lankan mobile number — SMS alerts (see "Real SMS (Text.lk)"
    // in CLAUDE.md) can only ever reach a correctly-formatted number, so
    // catching a typo at registration beats it silently failing to send later.
    let normalizedPhone = null;
    if (phone) {
      normalizedPhone = normalizeSriLankanPhone(phone);
      if (!normalizedPhone) {
        return res.status(400).json({
          error: "Enter a valid Sri Lankan mobile number, e.g. 0771234567.",
        });
      }
    }

    let normalizedNic = null;
    if (role === "victim") {
      if (!nic || !homeAddress) {
        return res.status(400).json({ error: "nic and homeAddress are required for victim accounts." });
      }
      normalizedNic = normalizeNic(nic);

      const existingSnap = await db.collection("users").where("nic", "==", normalizedNic).limit(1).get();
      const existingDoc = existingSnap.docs[0];
      if (existingDoc && existingDoc.id !== decoded.uid) {
        return res.status(409).json({ error: "This NIC is already registered to another account." });
      }
    }

    const profile = {
      uid: decoded.uid,
      email: decoded.email,
      role,
      name,
      phone: normalizedPhone,
      location: location || null,
      nic: normalizedNic,
      homeAddress: role === "victim" ? String(homeAddress).trim() : null,
      createdAt: new Date().toISOString(),
    };

    await db.collection("users").doc(decoded.uid).set(profile, { merge: true });

    return res.status(201).json(profile);
  } catch (err) {
    console.error("Create profile error:", err.message);
    return res.status(500).json({ error: "Failed to create profile.", details: err.message });
  }
});

/**
 * PATCH /api/users/profile
 * Any authed user: edit their own name and/or phone from Settings. Deliberately
 * separate from POST /profile (registration) rather than reused — that route
 * always re-writes `createdAt`, `role`, and (for victims) re-validates
 * nic/homeAddress, none of which belong in a simple "edit my name/phone" form.
 * Only updates the fields actually provided.
 * Body: { name?, phone? } — phone: "" explicitly clears it, a non-empty value
 * must be a valid Sri Lankan mobile number.
 */
router.patch("/profile", requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    const update = {};

    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ error: "name cannot be empty." });
      update.name = trimmed;
    }

    if (phone !== undefined) {
      if (phone === "") {
        update.phone = null;
      } else {
        const normalizedPhone = normalizeSriLankanPhone(phone);
        if (!normalizedPhone) {
          return res.status(400).json({ error: "Enter a valid Sri Lankan mobile number, e.g. 0771234567." });
        }
        update.phone = normalizedPhone;
      }
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: "Provide at least one of name or phone to update." });
    }

    await db.collection("users").doc(req.user.uid).update(update);
    return res.json({ uid: req.user.uid, ...update });
  } catch (err) {
    console.error("Update profile error:", err.message);
    return res.status(500).json({ error: "Failed to update profile.", details: err.message });
  }
});

/**
 * GET /api/users/me
 * Returns the logged-in user's own profile.
 */
router.get("/me", requireAuth, async (req, res) => {
  return res.json(req.user);
});

/**
 * GET /api/users/volunteers
 * Admin-only: list all volunteers, used to populate the assignment dropdown.
 */
router.get("/volunteers", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admins can list volunteers." });
    }
    const snapshot = await db.collection("users").where("role", "==", "volunteer").get();
    const volunteers = snapshot.docs.map((doc) => doc.data());
    return res.json(volunteers);
  } catch (err) {
    console.error("List volunteers error:", err.message);
    return res.status(500).json({ error: "Failed to list volunteers.", details: err.message });
  }
});

/**
 * PATCH /api/users/availability
 * Volunteer: mark themselves active/inactive for new assignments. Existing
 * volunteer docs with no `available` field are treated as available (see
 * GET /volunteers and AdminDonations.tsx, which check `available !== false`).
 * Body: { available: boolean }
 */
router.patch("/availability", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "volunteer") {
      return res.status(403).json({ error: "Only volunteers can set their own availability." });
    }
    const { available } = req.body;
    if (typeof available !== "boolean") {
      return res.status(400).json({ error: "available must be true or false." });
    }

    await db.collection("users").doc(req.user.uid).update({ available });
    return res.json({ uid: req.user.uid, available });
  } catch (err) {
    console.error("Update availability error:", err.message);
    return res.status(500).json({ error: "Failed to update availability.", details: err.message });
  }
});

/**
 * PATCH /api/users/location
 * Volunteer: set/update their own current location. Used purely to power
 * distance-based auto-assignment (see "Automatic volunteer assignment" in
 * CLAUDE.md) — registration itself never captures a location, so without
 * this a volunteer's `users.location` stays null forever and can't be
 * distance-ranked. Same self-owned-field pattern as PATCH /availability.
 * Body: { location: {lat, lng} }
 */
router.patch("/location", requireAuth, async (req, res) => {
  try {
    if (req.user.role !== "volunteer") {
      return res.status(403).json({ error: "Only volunteers can set their own location this way." });
    }
    const { location } = req.body;
    if (!location || typeof location.lat !== "number" || typeof location.lng !== "number") {
      return res.status(400).json({ error: "location must be an object with numeric lat and lng." });
    }

    await db.collection("users").doc(req.user.uid).update({ location });
    return res.json({ uid: req.user.uid, location });
  } catch (err) {
    console.error("Update location error:", err.message);
    return res.status(500).json({ error: "Failed to update location.", details: err.message });
  }
});

/**
 * POST /api/users/fcm-token
 * Any authed user: register a Firebase Cloud Messaging token for this
 * device/browser so they can receive push notifications (delivery status
 * updates, area disaster alerts). A user can have several tokens (one per
 * device/browser they've enabled notifications on) — stored as a set via
 * arrayUnion so re-registering the same token is a no-op.
 * Body: { token }
 */
router.post("/fcm-token", requireAuth, async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: "token is required." });

    await db
      .collection("users")
      .doc(req.user.uid)
      .update({ fcmTokens: admin.firestore.FieldValue.arrayUnion(token) });

    return res.json({ status: "ok" });
  } catch (err) {
    console.error("Register FCM token error:", err.message);
    return res.status(500).json({ error: "Failed to register notification token.", details: err.message });
  }
});

module.exports = router;
