import { useEffect, useState, type FormEvent } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

interface ChatDoc {
  partyAId: string;
  partyARole: string;
  partyBId: string;
  partyBRole: string;
  consentA: boolean;
  consentB: boolean;
  contactRevealed: boolean;
  status: "active" | "locked";
}

interface ChatMessage {
  id: string;
  senderId: string;
  text: string;
  createdAt: string;
}

interface Contact {
  revealed: boolean;
  name?: string;
  phone?: string | null;
}

/**
 * One-on-one chat for a delivery relationship (donor<->volunteer,
 * volunteer<->victim, or donor<->victim for self-delivery — see
 * server/src/utils/deliveryChats.js for which pair applies when). `chatId`
 * is a deterministic id (`${deliveryId}_${pairKey}`) the caller constructs
 * directly, so opening this modal needs no lookup round trip — it may
 * simply not exist yet if the delivery hasn't reached the stage that opens it.
 */
export function ChatModal({ chatId, onClose }: { chatId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [chat, setChat] = useState<ChatDoc | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [contact, setContact] = useState<Contact | null>(null);
  const [consenting, setConsenting] = useState(false);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "deliveryChats", chatId), (snap) => {
      setChat(snap.exists() ? (snap.data() as ChatDoc) : null);
      setLoading(false);
    });
    return unsubscribe;
  }, [chatId]);

  useEffect(() => {
    const q = query(collection(db, "chatMessages"), where("chatId", "==", chatId));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as ChatMessage[];
      data.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      setMessages(data);
    });
    return unsubscribe;
  }, [chatId]);

  useEffect(() => {
    if (chat?.contactRevealed) {
      apiFetch(`/api/chats/${chatId}/contact`).then(setContact);
    }
  }, [chat?.contactRevealed, chatId]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    setError("");
    try {
      await apiFetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: text.trim() }),
      });
      setText("");
    } catch (err: any) {
      setError(err.message || t("chatModal.sendFailed"));
    } finally {
      setSending(false);
    }
  }

  async function handleShareContact() {
    setConsenting(true);
    setError("");
    try {
      await apiFetch(`/api/chats/${chatId}/consent`, { method: "PATCH" });
    } catch (err: any) {
      setError(err.message || t("chatModal.consentFailed"));
    } finally {
      setConsenting(false);
    }
  }

  if (loading || !profile) {
    return (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-4 text-center text-sm text-gray-500">
          {t("common.loading")}
        </div>
      </div>
    );
  }

  if (!chat) {
    return (
      <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-sm rounded-xl bg-white p-4 text-center text-sm text-gray-500">
          {t("chatModal.notAvailableYet")}
          <button
            onClick={onClose}
            className="mt-3 block w-full rounded bg-gray-100 py-1.5 text-sm text-gray-700 hover:bg-gray-200"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
    );
  }

  const isA = chat.partyAId === profile.uid;
  const myConsent = isA ? chat.consentA : chat.consentB;
  const otherRole = isA ? chat.partyBRole : chat.partyARole;
  const otherRoleLabel = t(`chatModal.role.${otherRole}`, otherRole);
  const locked = chat.status === "locked";

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-md flex-col rounded-xl bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold capitalize text-gray-900">
              {t("chatModal.chatWith", { name: contact?.revealed ? contact.name : otherRoleLabel })}
            </h3>
            {contact?.revealed && contact.phone && <p className="text-xs text-gray-500">{contact.phone}</p>}
          </div>
          <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700">
            {t("common.close")}
          </button>
        </div>

        {locked && (
          <p className="mb-2 rounded bg-gray-100 px-2 py-1.5 text-xs text-gray-600">{t("chatModal.locked")}</p>
        )}
        {!locked && !myConsent && (
          <button
            onClick={handleShareContact}
            disabled={consenting}
            className="mb-2 rounded border border-orange-600 px-3 py-1.5 text-left text-xs font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
          >
            {consenting ? t("chatModal.sharing") : t("chatModal.shareContact", { role: otherRoleLabel })}
          </button>
        )}
        {!locked && myConsent && !chat.contactRevealed && (
          <p className="mb-2 text-xs text-gray-500">{t("chatModal.waitingForOther", { role: otherRoleLabel })}</p>
        )}
        {chat.contactRevealed && (
          <p className="mb-2 text-xs text-green-700">{t("chatModal.contactShared")}</p>
        )}

        <div className="flex-1 space-y-2 overflow-y-auto border-t border-gray-100 pt-3">
          {messages.length === 0 ? (
            <p className="text-sm text-gray-500">{t("chatModal.noMessages")}</p>
          ) : (
            messages.map((m) => {
              const mine = m.senderId === profile.uid;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[75%] rounded-lg px-3 py-1.5 text-sm ${
                      mine ? "bg-orange-600 text-white" : "bg-gray-100 text-gray-800"
                    }`}
                  >
                    <p>{m.text}</p>
                    <p className={`mt-0.5 text-[10px] ${mine ? "text-orange-100" : "text-gray-400"}`}>
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!locked && (
          <form onSubmit={handleSend} className="mt-3 border-t border-gray-100 pt-3">
            {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
            <div className="flex gap-2">
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t("chatModal.messagePlaceholder")}
                className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                disabled={sending || !text.trim()}
                className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {t("chatModal.send")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
