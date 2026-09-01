const { db } = require("../config/firebase");
const { normalizeSriLankanPhone } = require("./phone");

const TEXTLK_SEND_URL = "https://app.text.lk/api/v3/sms/send";

/**
 * Sends an SMS to a user via Text.lk (a Sri Lankan SMS gateway — Twilio
 * doesn't operate in Sri Lanka). Fails soft, same philosophy as
 * sendNotificationToUser (FCM) in notifications.js — a missing phone
 * number, missing API credentials, or a send error never breaks the
 * caller's actual work (verifying a request, updating a delivery, etc.).
 *
 * The API token is a real secret (server/.env, never in client code or
 * git) — this is the one and only place it's read. Only "plain" transactional
 * messages are sent (request status, delivery status, area alerts) — never
 * NIC, address, or other sensitive personal data in the message body.
 */
async function sendSmsToUser(uid, message) {
  try {
    const apiToken = process.env.TEXTLK_API_TOKEN;
    if (!apiToken) {
      console.log("SMS skipped (TEXTLK_API_TOKEN not set):", message);
      return;
    }

    const userDoc = await db.collection("users").doc(uid).get();
    const recipient = normalizeSriLankanPhone(userDoc.data()?.phone);
    if (!recipient) return;

    const res = await fetch(TEXTLK_SEND_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        recipient,
        sender_id: process.env.TEXTLK_SENDER_ID || "AidSystem",
        type: "plain",
        message,
      }),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok || data?.status !== "success") {
      console.error(`SMS send failed for user ${uid}:`, data?.message || res.status);
    }
  } catch (err) {
    console.error(`SMS send failed for user ${uid}:`, err.message);
  }
}

module.exports = { sendSmsToUser };
