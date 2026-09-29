const express = require("express");
const router = express.Router();
const { checkWaterLevelsAndAlert, checkReservoirsAndAlert } = require("../utils/waterLevelAlerts");
const { logger } = require("../utils/logger");

/**
 * Vercel Cron Jobs — the serverless replacement for server.js's own
 * setInterval loop, which can't survive between invocations once this app
 * runs as a Vercel Function rather than a long-lived process. server.js's
 * setInterval calls are left untouched for local dev / a persistent host
 * (Render, Railway) — these routes exist purely for the Vercel deployment
 * path, wired up in the repo root's vercel.json "crons" array. Calling
 * checkWaterLevelsAndAlert()/checkReservoirsAndAlert() twice in quick
 * succession is harmless either way — both only ever act on a genuine
 * escalation since the last recorded state, never on being invoked.
 *
 * Real cadence tradeoff, not a technical limitation of this code: Vercel's
 * free Hobby plan caps cron jobs at once per day (a Pro-plan account can run
 * these as often as every 10 minutes/hourly, matching server.js's original
 * cadence exactly). vercel.json's schedules are currently set to once daily
 * to match a Hobby account — river-gauge/reservoir escalations will only be
 * checked once a day on Vercel's free tier, a real reduction from the
 * near-real-time detection this feature has everywhere else it runs. If that
 * gap matters more than being on Vercel, running `server` on a persistent
 * host (Render/Railway) instead keeps the original cadence — `web` can still
 * deploy to Vercel independently either way.
 *
 * Vercel sends `Authorization: Bearer <CRON_SECRET>` on every cron-triggered
 * request once a CRON_SECRET env var is set on the project — checked here so
 * these routes can't be triggered by an arbitrary public GET, since they're
 * otherwise reachable at a real public path via vercel.json's /api/(.*)
 * rewrite. Set CRON_SECRET to a random value in the Vercel project's
 * environment variables (not in this repo) to enable the check; without it,
 * these routes are unauthenticated — acceptable for local/other hosting
 * where nothing ever calls them, but set it before relying on this on Vercel.
 */
function requireCronSecret(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized." });
  }
  next();
}

router.get("/water-levels", requireCronSecret, async (req, res) => {
  try {
    await checkWaterLevelsAndAlert();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Cron water-levels check failed");
    res.status(500).json({ error: "Water-level check failed.", details: err.message });
  }
});

router.get("/reservoirs", requireCronSecret, async (req, res) => {
  try {
    await checkReservoirsAndAlert();
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Cron reservoirs check failed");
    res.status(500).json({ error: "Reservoir check failed.", details: err.message });
  }
});

module.exports = router;
