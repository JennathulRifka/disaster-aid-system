import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/types";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<MessagesStackParamList, "ChatThread">;

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

// The mobile equivalent of web's ChatModal.tsx, as a full screen instead of
// a modal — one-on-one delivery chat (donor<->volunteer, volunteer<->victim,
// or donor<->victim for self-delivery). Same Firestore documents, same
// mutual-consent contact-reveal flow, same lock-on-confirm behavior.
export function ChatThreadScreen({ route }: Props) {
  const { chatId } = route.params;
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
  const listRef = useRef<FlatList>(null);

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

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed) return;
    setSending(true);
    setError("");
    try {
      await apiFetch(`/api/chats/${chatId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text: trimmed }),
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
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  if (!chat) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50 px-6">
        <Text className="text-center text-sm text-gray-500">{t("chatModal.notAvailableYet")}</Text>
      </View>
    );
  }

  const isA = chat.partyAId === profile.uid;
  const myConsent = isA ? chat.consentA : chat.consentB;
  const otherRole = isA ? chat.partyBRole : chat.partyARole;
  const otherRoleLabel = t(`chatModal.role.${otherRole}`, otherRole);
  const locked = chat.status === "locked";

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} className="flex-1 bg-gray-50">
      <View className="border-b border-gray-100 bg-white px-4 py-3">
        <Text className="text-base font-semibold capitalize text-gray-900">
          {t("chatModal.chatWith", { name: contact?.revealed ? contact.name : otherRoleLabel })}
        </Text>
        {contact?.revealed && (
          <Text className="text-xs text-gray-500">{contact.phone || t("chatModal.noPhoneOnFile")}</Text>
        )}
      </View>

      {locked && (
        <Text className="bg-gray-100 px-4 py-2 text-xs text-gray-600">{t("chatModal.locked")}</Text>
      )}
      {!locked && !myConsent && (
        <TouchableOpacity
          onPress={handleShareContact}
          disabled={consenting}
          className="mx-4 mt-2 self-start rounded border border-orange-600 px-3 py-1.5"
          style={{ opacity: consenting ? 0.5 : 1 }}
        >
          <Text className="text-xs font-medium text-orange-700">
            {consenting ? t("chatModal.sharing") : t("chatModal.shareContact", { role: otherRoleLabel })}
          </Text>
        </TouchableOpacity>
      )}
      {!locked && myConsent && !chat.contactRevealed && (
        <Text className="mx-4 mt-2 text-xs text-gray-500">
          {t("chatModal.waitingForOther", { role: otherRoleLabel })}
        </Text>
      )}
      {chat.contactRevealed && (
        <Text className="mx-4 mt-2 text-xs text-green-700">{t("chatModal.contactShared")}</Text>
      )}

      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text className="mt-6 text-center text-sm text-gray-500">{t("chatModal.noMessages")}</Text>
        }
        renderItem={({ item: m }) => {
          const mine = m.senderId === profile.uid;
          return (
            <View className={`mb-2 flex-row ${mine ? "justify-end" : "justify-start"}`}>
              <View
                className="max-w-[75%] rounded-2xl px-3 py-2"
                style={{ backgroundColor: mine ? "#ea580c" : "#f3f4f6" }}
              >
                <Text style={{ color: mine ? "white" : "#1f2937" }}>{m.text}</Text>
                <Text
                  className="mt-0.5 text-[10px]"
                  style={{ color: mine ? "rgba(255,255,255,0.75)" : "#9ca3af" }}
                >
                  {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </Text>
              </View>
            </View>
          );
        }}
      />

      {!locked && (
        <View className="border-t border-gray-100 bg-white p-3">
          {error ? <Text className="mb-2 text-xs text-red-600">{error}</Text> : null}
          <View className="flex-row items-center" style={{ gap: 8 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={t("chatModal.messagePlaceholder")}
              className="flex-1 rounded-full border border-gray-300 px-4 py-2.5"
            />
            <TouchableOpacity
              onPress={handleSend}
              disabled={sending || !text.trim()}
              className="rounded-full bg-orange-600 px-4 py-2.5"
              style={{ opacity: sending || !text.trim() ? 0.5 : 1 }}
            >
              <Text className="text-sm font-medium text-white">{t("chatModal.send")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
