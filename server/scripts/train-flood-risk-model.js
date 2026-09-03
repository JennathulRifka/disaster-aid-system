/**
 * CLI entry point for the flood risk model training pipeline. The actual
 * training logic lives in server/src/utils/trainFloodRiskModel.js — shared
 * with the admin-triggered "Retrain model" button (POST
 * /api/external/flood-risk/retrain) so there's one implementation, not two
 * copies to keep in sync.
 *
 * Run: node scripts/train-flood-risk-model.js  (or `npm run train-flood-model`)
 *
 * Manual re-runs are still useful for local iteration (e.g. after editing
 * the feature set), but day-to-day retraining is expected to happen via the
 * admin UI's "Retrain model" button on the Flood Risk Forecast tab now.
 */

const { trainFloodRiskModel } = require("../src/utils/trainFloodRiskModel");

trainFloodRiskModel({ onProgress: (msg) => console.log(msg) }).catch((err) => {
  console.error("Training failed:", err);
  process.exit(1);
});
