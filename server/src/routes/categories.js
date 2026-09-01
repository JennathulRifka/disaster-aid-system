const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth, requireRole } = require("../middleware/authMiddleware");
const { getCategoryLimits } = require("../utils/categories");

const router = express.Router();
const COLLECTION = "categoryLimits";

function slugify(label) {
  return String(label || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/**
 * GET /api/categories
 * Any authed user — victims need this to build the request form, donors to
 * build the donation form, admin to manage it.
 */
router.get("/", requireAuth, async (req, res) => {
  try {
    const limits = await getCategoryLimits();
    return res.json(limits);
  } catch (err) {
    console.error("List categories error:", err.message);
    return res.status(500).json({ error: "Failed to load categories.", details: err.message });
  }
});

/**
 * POST /api/categories
 * Admin: add a new requestable/donatable category.
 * Body: { label, max: number|null, unit }
 */
router.post("/", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const { label, max, unit } = req.body;
    if (!label || !unit) {
      return res.status(400).json({ error: "label and unit are required." });
    }
    if (max !== null && max !== undefined && (!Number.isFinite(Number(max)) || Number(max) <= 0)) {
      return res.status(400).json({ error: "max must be a positive number, or null for no cap." });
    }

    const key = slugify(label);
    if (!key) {
      return res.status(400).json({ error: "Couldn't derive a category key from that label — try a simpler label." });
    }

    const ref = db.collection(COLLECTION).doc(key);
    if ((await ref.get()).exists) {
      return res.status(409).json({ error: `A category with key "${key}" already exists.` });
    }

    const now = new Date().toISOString();
    const category = { label, max: max === undefined ? null : max, unit, createdAt: now, updatedAt: now };
    await ref.set(category);

    return res.status(201).json({ key, ...category });
  } catch (err) {
    console.error("Create category error:", err.message);
    return res.status(500).json({ error: "Failed to create category.", details: err.message });
  }
});

/**
 * PATCH /api/categories/:key
 * Admin: adjust an existing category's cap, label, or unit.
 * Body: { max?: number|null, label?, unit? }
 */
router.patch("/:key", requireAuth, requireRole("admin"), async (req, res) => {
  try {
    const ref = db.collection(COLLECTION).doc(req.params.key);
    const doc = await ref.get();
    if (!doc.exists) return res.status(404).json({ error: "Category not found." });

    const { max, label, unit } = req.body;
    const update = { updatedAt: new Date().toISOString() };

    if (max !== undefined) {
      if (max !== null && (!Number.isFinite(Number(max)) || Number(max) <= 0)) {
        return res.status(400).json({ error: "max must be a positive number, or null for no cap." });
      }
      update.max = max;
    }
    if (label !== undefined) update.label = label;
    if (unit !== undefined) update.unit = unit;

    await ref.update(update);
    return res.json({ key: req.params.key, ...doc.data(), ...update });
  } catch (err) {
    console.error("Update category error:", err.message);
    return res.status(500).json({ error: "Failed to update category.", details: err.message });
  }
});

module.exports = router;
