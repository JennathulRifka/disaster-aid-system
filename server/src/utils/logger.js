/**
 * Structured logging (pino) instead of scattered console.log/console.error.
 * Pretty-printed in development (readable in a terminal), plain JSON in
 * production (parseable by a log aggregator, if this were ever deployed).
 *
 * Adopted at the framework level for this pass — request logging
 * (pino-http, wired into app.js) and the central error handler — rather
 * than a full mechanical sweep of the ~90 existing console.* calls scattered
 * across every route file. Those are unaffected by this change; converting
 * them is a safe, low-risk follow-up (same call shape, `logger.error(...)`
 * instead of `console.error(...)`) whenever it's worth doing, not something
 * this pass attempted wholesale without reviewing each call site.
 */
const pino = require("pino");

const isProduction = process.env.NODE_ENV === "production";

const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isProduction
    ? undefined
    : {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
      },
});

module.exports = { logger };
