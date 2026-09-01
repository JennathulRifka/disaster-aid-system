const express = require("express");
const { db } = require("../config/firebase");
const { requireAuth } = require("../middleware/authMiddleware");
const { sendNotificationToUser } = require("../utils/notifications");

const router = express.Router();

function isParticipant(chat, uid) {
  return chat.partyAId === uid || chat.partyBId === uid;
}

function otherParty(chat, uid) {
  return chat.partyAId === uid
    ? { id: chat.partyBId, role: chat.partyBRole }
    : { id: chat.partyAId, role: chat.partyARole };
}

/**
 * GET /api/chats/mine
 * Any authed role: every chat they're a participant in (donor/volunteer/
 * victim — not admin, this isn't an admin surface). Two separate queries
 * (partyAId == me, partyBId == me) merged in JS, since Firestore can't OR
 * across two different fields in one query.
 */
router.get("/mine", requireAuth, async (req, res) => {
  try {
    const [asA, asB] = await Promise.all([
      db.collection("deliveryChats").where("partyAId", "==", req.user.uid).get(),
      db.collection("deliveryChats").where("partyBId", "==", req.user.uid).get(),
    ]);
    const chats = [...asA.docs, ...asB.docs]
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return res.json(chats);
  } catch (err) {
    console.error("List my chats error:", err.message);
    return res.status(500).json({ error: "Failed to list chats.", details: err.message });
  }
});

/**
 * POST /api/chats/:chatId/messages
 * Send a message. Body: { text }. Blocked once the chat is locked (delivery
 * confirmed) — the whole point of locking is no further contact through it.
 * Notifies the other party via FCM only, deliberately not SMS — a chat can
 * generate many messages and this project's SMS quota (Text.lk) is limited
 * and reserved for the handful of higher-value trigger points already
 * wired (request approved, picked up, delivered, area alerts).
 */
router.post("/:chatId/messages", requireAuth, async (req, res) => {
  try {
    const text = (req.body?.text || "").trim();
    if (!text) return res.status(400).json({ error: "Message text is required." });
    if (text.length > 1000) return res.status(400).json({ error: "Message is too long (max 1000 characters)." });

    const chatRef = db.collection("deliveryChats").doc(req.params.chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: "Chat not found." });
    const chat = chatDoc.data();

    if (!isParticipant(chat, req.user.uid)) {
      return res.status(403).json({ error: "You're not a participant in this chat." });
    }
    if (chat.status === "locked") {
      return res.status(400).json({ error: "This chat is locked — the delivery it was for has been confirmed." });
    }

    const now = new Date().toISOString();
    await db.collection("chatMessages").add({
      chatId: req.params.chatId,
      senderId: req.user.uid,
      senderRole: chat.partyAId === req.user.uid ? chat.partyARole : chat.partyBRole,
      text,
      createdAt: now,
    });
    await chatRef.update({ updatedAt: now });

    const recipient = otherParty(chat, req.user.uid);
    await sendNotificationToUser(recipient.id, {
      title: "New message",
      body: text.length > 80 ? `${text.slice(0, 77)}...` : text,
      data: { type: "chat.message", chatId: req.params.chatId },
    });

    return res.status(201).json({ status: "sent" });
  } catch (err) {
    console.error("Send chat message error:", err.message);
    return res.status(500).json({ error: "Failed to send message.", details: err.message });
  }
});

/**
 * PATCH /api/chats/:chatId/consent
 * Sets the caller's own consent flag to share their real name/phone with
 * the other party. No body needed, no revoke — once given it stays for the
 * chat's lifetime, same as every other one-way consent action in this app.
 * Once BOTH sides have consented, contactRevealed flips true and both are
 * notified — this is the only thing that unlocks GET /:chatId/contact.
 */
router.patch("/:chatId/consent", requireAuth, async (req, res) => {
  try {
    const chatRef = db.collection("deliveryChats").doc(req.params.chatId);
    const chatDoc = await chatRef.get();
    if (!chatDoc.exists) return res.status(404).json({ error: "Chat not found." });
    const chat = chatDoc.data();

    if (!isParticipant(chat, req.user.uid)) {
      return res.status(403).json({ error: "You're not a participant in this chat." });
    }
    if (chat.status === "locked") {
      return res.status(400).json({ error: "This chat is locked — the delivery it was for has been confirmed." });
    }

    const isA = chat.partyAId === req.user.uid;
    const update = isA ? { consentA: true } : { consentB: true };
    const nowConsentA = isA ? true : chat.consentA;
    const nowConsentB = isA ? chat.consentB : true;
    const contactRevealed = nowConsentA && nowConsentB;

    const now = new Date().toISOString();
    await chatRef.update({ ...update, contactRevealed, updatedAt: now });

    if (contactRevealed && !chat.contactRevealed) {
      await Promise.all([
        sendNotificationToUser(chat.partyAId, {
          title: "Contact details shared",
          body: "You can now see each other's name and phone number for this delivery.",
          data: { type: "chat.contact_revealed", chatId: req.params.chatId },
        }),
        sendNotificationToUser(chat.partyBId, {
          title: "Contact details shared",
          body: "You can now see each other's name and phone number for this delivery.",
          data: { type: "chat.contact_revealed", chatId: req.params.chatId },
        }),
      ]);
    }

    return res.json({ consentA: nowConsentA, consentB: nowConsentB, contactRevealed });
  } catch (err) {
    console.error("Chat consent error:", err.message);
    return res.status(500).json({ error: "Failed to record consent.", details: err.message });
  }
});

/**
 * GET /api/chats/:chatId/contact
 * Returns the OTHER party's name + phone, but only once contactRevealed is
 * true (both sides consented) — gated here rather than via a direct client
 * Firestore read of `users/{otherUid}`, since that would need opening up
 * read access to another user's full profile (NIC etc.) just to expose two
 * fields. This is the one place this project fetches another user's PII on
 * someone else's behalf, and it's deliberately narrow: two fields, one
 * mutual-consent gate, nothing else from that user's profile.
 */
router.get("/:chatId/contact", requireAuth, async (req, res) => {
  try {
    const chatDoc = await db.collection("deliveryChats").doc(req.params.chatId).get();
    if (!chatDoc.exists) return res.status(404).json({ error: "Chat not found." });
    const chat = chatDoc.data();

    if (!isParticipant(chat, req.user.uid)) {
      return res.status(403).json({ error: "You're not a participant in this chat." });
    }
    if (!chat.contactRevealed) {
      return res.json({ revealed: false });
    }

    const recipient = otherParty(chat, req.user.uid);
    const userDoc = await db.collection("users").doc(recipient.id).get();
    if (!userDoc.exists) return res.json({ revealed: false });

    return res.json({ revealed: true, name: userDoc.data().name, phone: userDoc.data().phone || null });
  } catch (err) {
    console.error("Get chat contact error:", err.message);
    return res.status(500).json({ error: "Failed to load contact details.", details: err.message });
  }
});

module.exports = router;
