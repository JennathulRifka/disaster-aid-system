const { db } = require("../config/firebase");
const { sendNotificationToUser } = require("./notifications");

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
};

async function createChat(deliveryId, requestId, donationId, pairKey, partyAId, partyARole, partyBId, partyBRole) {
  const chatId = `${deliveryId}_${pairKey}`;
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
 */
async function createChatsForAcceptedDelivery(delivery, deliveryId) {
  try {
    const [donationDoc, requestDoc] = await Promise.all([
      db.collection("donations").doc(delivery.donationId).get(),
      db.collection("aidRequests").doc(delivery.requestId).get(),
    ]);
    if (!donationDoc.exists || !requestDoc.exists) return;
    const donorId = donationDoc.data().donorId;
    const victimId = requestDoc.data().victimId;

    await Promise.all([
      createChat(deliveryId, delivery.requestId, delivery.donationId, PAIR_KEYS.DONOR_VOLUNTEER, donorId, "donor", delivery.volunteerId, "volunteer"),
      createChat(deliveryId, delivery.requestId, delivery.donationId, PAIR_KEYS.VOLUNTEER_VICTIM, delivery.volunteerId, "volunteer", victimId, "victim"),
    ]);
  } catch (err) {
    console.error(`Failed to create chats for accepted delivery ${deliveryId}:`, err.message);
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
    console.error(`Failed to create chat for self-delivery ${deliveryId}:`, err.message);
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
    console.error(`Failed to lock chats for delivery ${deliveryId}:`, err.message);
  }
}

module.exports = { PAIR_KEYS, createChatsForAcceptedDelivery, createChatForSelfDelivery, lockChatsForDelivery };
