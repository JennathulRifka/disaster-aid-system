const { db } = require("../config/firebase");

/**
 * Records who did what, to what, and when — the accountability trail behind
 * every consequential admin decision (approve/reject, match, assign).
 * Append-only, admin-read-only (see the auditLog rule block in
 * firestore-rules/firestore.rules).
 */
async function logAction(actor, action, target, details = {}) {
  await db.collection("auditLog").add({
    action,
    actorId: actor.uid,
    actorName: actor.name,
    targetType: target.type,
    targetId: target.id,
    details,
    createdAt: new Date().toISOString(),
  });
}

module.exports = { logAction };
