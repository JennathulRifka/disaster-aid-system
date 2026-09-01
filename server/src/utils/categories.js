const { db } = require("../config/firebase");

/**
 * Aid categories a victim can request, and a per-category quantity cap.
 * Caps keep individual requests reasonable so limited donations get spread
 * across more households instead of one request draining a category.
 * Units are just for display — quantity itself is a plain number.
 * max: null means no hard cap — originally just medicine (flagged for
 * manual admin review instead, see AdminRequests.tsx), but admins can now
 * set any category to uncapped from /admin/categories.
 *
 * Lives in Firestore (`categoryLimits` collection, one doc per category key)
 * so admins can adjust caps and add new categories without a code change.
 * These are the seed defaults, used only the first time the collection is
 * read and found empty — after that, Firestore is the source of truth.
 */
const DEFAULT_CATEGORY_LIMITS = {
  food: { label: "Food", max: 10, unit: "kg" },
  water: { label: "Water", max: 20, unit: "liters" },
  medicine: { label: "Medicine", max: null, unit: "packs" },
  clothing: { label: "Clothing", max: 15, unit: "items" },
  shelter: { label: "Shelter", max: 1, unit: "units" },
  baby_formula: { label: "Baby formula", max: 4, unit: "tins" },
  hygiene_kits: { label: "Hygiene kits", max: 5, unit: "kits" },
};

const COLLECTION = "categoryLimits";

/** Returns { [key]: { label, max, unit } } for every category, seeding defaults on first use. */
async function getCategoryLimits() {
  const snapshot = await db.collection(COLLECTION).get();

  if (snapshot.empty) {
    const now = new Date().toISOString();
    const batch = db.batch();
    Object.entries(DEFAULT_CATEGORY_LIMITS).forEach(([key, value]) => {
      batch.set(db.collection(COLLECTION).doc(key), { ...value, createdAt: now, updatedAt: now });
    });
    await batch.commit();
    return DEFAULT_CATEGORY_LIMITS;
  }

  const limits = {};
  snapshot.docs.forEach((doc) => {
    const { label, max, unit } = doc.data();
    limits[doc.id] = { label, max: max ?? null, unit };
  });
  return limits;
}

module.exports = { getCategoryLimits, DEFAULT_CATEGORY_LIMITS };
