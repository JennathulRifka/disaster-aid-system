/**
 * Structured logging (pino) instead of scattered console.log/console.error.
 * Pretty-printed in development (readable in a terminal), plain JSON in
 * production (parseable by a log aggregator).
 *
 * Originally adopted only at the framework level — request logging
 * (pino-http, wired into app.js) and the central error handler — with the
 * ~102 console.* calls scattered across every route/utility file left as a
 * follow-up. That follow-up is now done: every console.log/error/warn call
 * in src/ has been converted to the equivalent logger.info/error/warn call,
 * reviewed individually (not a blind find-and-replace, since pino's calling
 * convention is `logger.error({err}, "message")`, not
 * `console.error("message", err)`).
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
