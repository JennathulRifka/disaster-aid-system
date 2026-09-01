/**
 * Rule-Based Priority Allocation Mechanism.
 * Scores an aid request across 4 weighted criteria:
 *   - severity (0-40)
 *   - number of people affected (0-30)
 *   - presence of vulnerable groups (0-25, 5 per group listed)
 *   - time waiting since submission (0-20, grows over time)
 * Total possible score: 0-115. Higher score = higher priority.
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
