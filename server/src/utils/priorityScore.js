/**
 * Rule-Based Priority Allocation Mechanism.
 * Scores an aid request across 4 weighted criteria:
 *   - severity (0-40)
 *   - number of people affected (0-30)
 *   - presence of vulnerable groups (5 per group listed, capped at 25 — but
 *     the request form only offers 4 groups, so 20 is the reachable maximum
 *     and the cap of 25 is never actually hit)
 *   - time waiting since submission (0-20, grows over time)
 * Severity always contributes at least 10 (unknown severity defaults to low).
 * Reachable range: 10-110 with the current form (theoretical code maximum
 * 115). Higher score = higher priority.
 * Note the wait term is capped at 20, which is smaller than the 30-point gap
 * between critical (40) and low (10) severity, so waiting alone can never
 * lift a low-severity request above a critical one.
 */
function calculatePriorityScore(request) {
  const severityWeights = { critical: 40, high: 30, medium: 20, low: 10 };
  const severityScore = severityWeights[request.severity] || 10;

  const peopleAffected = Number(request.peopleAffected) || 0;
  const affectedScore = Math.min(peopleAffected * 2, 30);

  const vulnerableGroups = Array.isArray(request.vulnerableGroups) ? request.vulnerableGroups : [];
  const vulnerableScore = Math.min(vulnerableGroups.length * 5, 25);

  const createdAtMs = request.createdAt ? new Date(request.createdAt).getTime() : Date.now();
  const hoursWaiting = Math.max((Date.now() - createdAtMs) / (1000 * 60 * 60), 0);
  const waitScore = Math.min(hoursWaiting * 1.5, 20);

  const total = severityScore + affectedScore + vulnerableScore + waitScore;

  return {
    total: Math.round(total * 100) / 100,
    breakdown: {
      severityScore,
      affectedScore,
      vulnerableScore,
      waitScore: Math.round(waitScore * 100) / 100,
    },
  };
}

module.exports = { calculatePriorityScore };
