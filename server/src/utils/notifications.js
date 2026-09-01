const { admin, db } = require("../config/firebase");

/**
 * Sends a push notification to every device a user has registered an FCM
 * token for (see POST /api/users/fcm-token). Fails soft — a missing profile,
 * no registered tokens, or a send error should never break the caller's
 * actual work (verifying a request, updating a delivery, etc.), so this
 * never throws.
 */
async function sendNotificationToUser(uid, { title, body, data = {} }) {
  try {
    const userDoc = await db.collection("users").doc(uid).get();
    const tokens = userDoc.data()?.fcmTokens || [];
    if (tokens.length === 0) return;

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])),
    });

    // Prune tokens FCM reports as no-longer-valid — either genuinely dead
    // (uninstalled, permission revoked, expired: "not-registered" /
    // "invalid-registration-token") or malformed ("invalid-argument", the
    // code FCM actually returns for a garbage/non-FCM-shaped string, e.g. a
    // truncated write or a bad value from some other client bug) — so this
    // list doesn't grow stale forever.
    const DEAD_TOKEN_CODES = [
      "messaging/registration-token-not-registered",
      "messaging/invalid-registration-token",
      "messaging/invalid-argument",
    ];
    const deadTokens = response.responses
      .map((r, i) => (DEAD_TOKEN_CODES.includes(r.error?.code) ? tokens[i] : null))
      .filter(Boolean);

    if (deadTokens.length > 0) {
      await db
        .collection("users")
        .doc(uid)
        .update({ fcmTokens: admin.firestore.FieldValue.arrayRemove(...deadTokens) });
    }
  } catch (err) {
    console.error(`Notification send failed for user ${uid}:`, err.message);
  }
}

module.exports = { sendNotificationToUser };
