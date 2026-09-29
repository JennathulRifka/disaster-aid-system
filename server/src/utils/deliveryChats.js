const { db } = require("../config/firebase");
const { sendNotificationToUser } = require("./notifications");
const { logger } = require("./logger");

// One chat per (delivery, pair) — a volunteer-delivery has two independent
// chats (donor<->volunteer to coordinate pickup, volunteer<->victim to
// coordinate dropoff); a self-delivery has one (donor<->victim directly,
// since there's no volunteer in that flow). Doc id is deterministic
// (`${deliveryId}_${pairKey}`) so the frontend can construct it directly
// from data it already has, with no extra lookup round trip.
const PAIR_KEYS = {
  DONOR_VOLUNTEER: "donor_volunteer",
  VOLUNTEER_VICTIM: "volunteer_victim",
  DONOR_VICTIM: "donor_victim",
  VOLUNTEER_VOLUNTEER: "volunteer_volunteer",
};

/**
 * Deterministic chat id for a (delivery, pair). `handoffVersion` defaults to
 * 0 (the delivery's original volunteer, or no volunteer involved at all for
 * donor<->victim self-delivery chats) and is OMITTED from the id in that
 * case — so this produces byte-for-byte the same id today's callers already
 * rely on. Only once a delivery has actually been handed off (see "Fellow
 * travellers" Phase 2 in CLAUDE.md) does the id gain a `_v{N}` segment,
 * which is what lets the new volunteer get a genuinely fresh chat (new
 * consent, no risk of the old volunteer's messages appearing inside what's
 * now nominally "their" thread) instead of colliding with the old one.
 */
function chatIdFor(deliveryId, pairKey, handoffVersion = 0) {
  return handoffVersion > 0 ? `${deliveryId}_v${handoffVersion}_${pairKey}` : `${deliveryId}_${pairKey}`;
}

async function createChat(deliveryId, requestId, donationId, pairKey, partyAId, partyARole, partyBId, partyBRole, handoffVersion = 0) {
  const chatId = chatIdFor(deliveryId, pairKey, handoffVersion);
  const ref = db.collection("deliveryChats").doc(chatId);
  const existing = await ref.get();
  if (existing.exists) return chatId; // already created — e.g. a delivery that was rejected then reassigned

  const now = new Date().toISOString();
  await ref.set({
    deliveryId,
    requestId,
    donationId,
    pairKey,
    partyAId,
    partyARole,
    partyBId,
    partyBRole,
    // Real name/phone are deliberately NOT stored here — the chat only ever
    // identifies the other party by role until both sides consent (see
    // routes/chats.js's GET /:chatId/contact), at which point it's looked up
    // fresh from `users` rather than a value frozen at chat-creation time.
    consentA: false,
    consentB: false,
    contactRevealed: false,
    status: "active", // active -> locked (once the delivery is confirmed)
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all([
    sendNotificationToUser(partyAId, {
      title: "New chat available",
      body: `You can now message the ${partyBRole} for this delivery.`,
      data: { type: "chat.opened", chatId },
    }),
    sendNotificationToUser(partyBId, {
      title: "New chat available",
      body: `You can now message the ${partyARole} for this delivery.`,
      data: { type: "chat.opened", chatId },
    }),
  ]);

  return chatId;
}

/**
 * Called once a volunteer accepts a delivery (deliveries.js's PATCH
 * /:id/accept) — this is "linked," not the earlier pending_acceptance state,
 * since before acceptance the volunteer hasn't actually committed and could
 * still be swapped for someone else. Opens both chats a volunteer-delivery
 * needs: donor<->volunteer and volunteer<->victim. Fails soft — a chat
 * failing to create should never block the actual accept action.
 *
 * `handoffVersion` is also reused for the OTHER time a delivery gets a new
 * volunteer: a completed handoff (see routes/deliveries.js's
 * PATCH /handoffs/:id/accept, "Fellow travellers" Phase 2 in CLAUDE.md).
 * Passing the delivery's bumped handoffVersion here — instead of leaving it
 * at the default 0 — is what gives the new volunteer a genuinely fresh pair
 * of chats rather than colliding with (and silently returning) the old,
 * now-locked ones at the same deterministic id.
 */
async function createChatsForAcceptedDelivery(delivery, deliveryId, handoffVersion = 0) {
  try {
    const [donationDoc, requestDoc] = await Promise.all([
      db.collection("donations").doc(delivery.donationId).get(),
      db.collection("aidRequests").doc(delivery.requestId).get(),
    ]);
    if (!donationDoc.exists || !requestDoc.exists) return;
    const donorId = donationDoc.data().donorId;
    const victimId = requestDoc.data().victimId;

    await Promise.all([
      createChat(deliveryId, delivery.requestId, delivery.donationId, PAIR_KEYS.DONOR_VOLUNTEER, donorId, "donor", delivery.volunteerId, "volunteer", handoffVersion),
      createChat(deliveryId, delivery.requestId, delivery.donationId, PAIR_KEYS.VOLUNTEER_VICTIM, delivery.volunteerId, "volunteer", victimId, "victim", handoffVersion),
    ]);
  } catch (err) {
    logger.error({ err, deliveryId }, "Failed to create chats for accepted delivery");
  }
}

/**
 * Called once a self-delivery donation is matched (donations.js's POST
 * /:id/match, the `deliveryMethod === "self"` branch) — donor and victim are
 * linked immediately, no volunteer accept step exists in this flow.
 */
async function createChatForSelfDelivery(deliveryId, requestId, donationId, donorId, victimId) {
  try {
    await createChat(deliveryId, requestId, donationId, PAIR_KEYS.DONOR_VICTIM, donorId, "donor", victimId, "victim");
  } catch (err) {
    logger.error({ err, deliveryId }, "Failed to create chat for self-delivery");
  }
}

/**
 * Called once a delivery is confirmed (deliveries.js's POST /:id/confirm) —
 * locks every chat tied to that delivery. Locked means read-only: the
 * message history and any already-revealed contact info stay visible, but
 * no new messages or consent changes are accepted (enforced in
 * routes/chats.js, not just this flag — this just drives that check).
 */
async function lockChatsForDelivery(deliveryId) {
  try {
    const snapshot = await db.collection("deliveryChats").where("deliveryId", "==", deliveryId).get();
    const now = new Date().toISOString();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.update({ status: "locked", updatedAt: now })));
  } catch (err) {
    logger.error({ err, deliveryId }, "Failed to lock chats for delivery");
  }
}

/**
 * Fellow-traveller chat: two volunteers on two different, otherwise-
 * unrelated deliveries that happen to share a destination (and optionally
 * origin) district — see "Fellow travellers" in CLAUDE.md. Deliberately NOT
 * built on top of createChat() above: that helper's id scheme
 * (`${deliveryId}_${pairKey}`) assumes exactly one delivery per chat, but
 * this chat spans two independent deliveries with no natural "primary"
 * one. Id is the two delivery ids sorted (order-independent, so either
 * volunteer clicking "message" first lands on the same chat doc) plus a
 * fixed suffix. Stored under new field names (`deliveryIdA`/`deliveryIdB`),
 * NOT `deliveryId` — this is deliberate, not an inconsistency: it keeps
 * this chat structurally invisible to lockChatsForDelivery()'s
 * `where("deliveryId", "==", ...)` query, so confirming either underlying
 * delivery can never accidentally lock this chat (fellow-traveller chats
 * are peer-to-peer volunteer conversations, not tied to one transaction,
 * and are a deliberate exception to this file's usual lock-on-confirm
 * behavior — confirmed with the user before building).
 *
 * Also unlike every other chat here (all system-created at accept/match
 * time), this one is user-initiated — a volunteer clicking "message" on
 * the fellow-travellers list (see routes/deliveries.js's
 * POST /:id/fellow-travellers/:otherId/chat). Idempotent the same way as
 * createChat(), via existing.exists.
 */
async function createOrGetFellowTravellerChat(deliveryIdA, volunteerAId, deliveryIdB, volunteerBId) {
  const [firstDeliveryId, secondDeliveryId] = [deliveryIdA, deliveryIdB].sort();
  const [firstVolunteerId, secondVolunteerId] =
    firstDeliveryId === deliveryIdA ? [volunteerAId, volunteerBId] : [volunteerBId, volunteerAId];
  const chatId = `${firstDeliveryId}_${secondDeliveryId}_${PAIR_KEYS.VOLUNTEER_VOLUNTEER}`;
  const ref = db.collection("deliveryChats").doc(chatId);
  const existing = await ref.get();
  if (existing.exists) return chatId;

  const now = new Date().toISOString();
  await ref.set({
    deliveryIdA: firstDeliveryId,
    deliveryIdB: secondDeliveryId,
    pairKey: PAIR_KEYS.VOLUNTEER_VOLUNTEER,
    partyAId: firstVolunteerId,
    partyARole: "volunteer",
    partyBId: secondVolunteerId,
    partyBRole: "volunteer",
    consentA: false,
    consentB: false,
    contactRevealed: false,
    status: "active", // fellow-traveller chats never auto-lock — see the note above
    createdAt: now,
    updatedAt: now,
  });

  await Promise.all([
    sendNotificationToUser(firstVolunteerId, {
      title: "New fellow-traveller chat",
      body: "Another volunteer heading the same way wants to connect.",
      data: { type: "chat.opened", chatId },
    }),
    sendNotificationToUser(secondVolunteerId, {
      title: "New fellow-traveller chat",
      body: "Another volunteer heading the same way wants to connect.",
      data: { type: "chat.opened", chatId },
    }),
  ]);

  return chatId;
}

module.exports = {
  PAIR_KEYS,
  chatIdFor,
  createChatsForAcceptedDelivery,
  createChatForSelfDelivery,
  lockChatsForDelivery,
  createOrGetFellowTravellerChat,
};
