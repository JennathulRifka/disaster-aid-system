/**
 * Derives a request's overall status from its per-item status.
 * Items go pending -> matched -> delivered independently (each category can
 * come from a different donor), so the request as a whole is "in_progress"
 * until every item is delivered.
 */
function computeOverallStatus(items) {
  if (items.every((item) => item.status === "delivered")) return "delivered";
  if (items.some((item) => item.status !== "pending")) return "in_progress";
  return "verified";
}

module.exports = { computeOverallStatus };
