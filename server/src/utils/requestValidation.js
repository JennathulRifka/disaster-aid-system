/**
 * Pure validation/normalization helpers for aid request submission —
 * extracted out of routes/requests.js (which previously defined these
 * inline) specifically so they're unit-testable without pulling in that
 * route file's Firebase Admin SDK dependency (importing requests.js
 * directly would initialize firebase-admin at module-load time, which
 * throws without real credentials — exactly what CI must never need).
 * No behavior change, just a relocation.
 */

/** Case/whitespace-insensitive address comparison key, for possible-duplicate detection. */
function normalizeAddress(address) {
  return String(address || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Case-insensitive NIC comparison key, for possible-duplicate detection. */
function normalizeNic(nic) {
  return String(nic || "").trim().toUpperCase();
}

/**
 * Validates a multi-category request's items against the current category
 * caps. Returns an error message string, or null if every item is valid.
 * Enforces: at least one item, only recognized categories, no category
 * requested twice, a positive numeric quantity, and per-category caps
 * (`limit.max === null` means uncapped — e.g. medicine, flagged for admin
 * review elsewhere instead of a hard cap).
 */
function validateItems(items, categoryLimits) {
  if (!Array.isArray(items) || items.length === 0) {
    return "At least one requested item is required.";
  }

  const seenCategories = new Set();
  for (const item of items) {
    const limit = categoryLimits[item?.category];
    if (!limit) {
      return `"${item?.category}" is not a recognized category.`;
    }
    if (seenCategories.has(item.category)) {
      return `"${item.category}" was requested more than once — combine it into a single line.`;
    }
    seenCategories.add(item.category);

    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return `Quantity for "${item.category}" must be a positive number.`;
    }
    if (limit.max !== null && quantity > limit.max) {
      return `"${limit.label}" is capped at ${limit.max} ${limit.unit} per request.`;
    }
  }
  return null;
}

module.exports = { normalizeAddress, normalizeNic, validateItems };
