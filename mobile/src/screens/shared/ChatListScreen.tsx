import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { MessagesStackParamList } from "../../navigation/types";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";

type Props = NativeStackScreenProps<MessagesStackParamList, "ChatList">;

interface ChatDoc {
  id: string;
  partyAId: string;
  partyARole: string;
  partyBId: string;
  partyBRole: string;
  status: "active" | "locked";
  updatedAt: string;
}

// The mobile equivalent of a Messenger-style conversations list — every
// delivery chat the caller is a participant in (donor<->volunteer,
// volunteer<->victim, donor<->victim for self-delivery), newest first.
// Live via onSnapshot (two queries merged in JS, mirroring exactly what
// GET /api/chats/mine does server-side — Firestore can't OR across two
// different fields in one query) rather than a one-time fetch, since this
// is a screen a user would naturally revisit the way they would Messenger.
export function ChatListScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [chatsA, setChatsA] = useState<ChatDoc[] | null>(null);
  const [chatsB, setChatsB] = useState<ChatDoc[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    const qA = query(collection(db, "deliveryChats"), where("partyAId", "==", profile.uid));
    const qB = query(collection(db, "deliveryChats"), where("partyBId", "==", profile.uid));
    const unsubA = onSnapshot(qA, (snap) => {
      setChatsA(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatDoc));
    });
    const unsubB = onSnapshot(qB, (snap) => {
      setChatsB(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as ChatDoc));
    });
    return () => {
      unsubA();
      unsubB();
    };
  }, [profile]);

  const loading = chatsA === null || chatsB === null;
  const chats = loading
    ? []
    : [...chatsA, ...chatsB].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      <FlatList
        data={chats}
        keyExtractor={(c) => c.id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        ListEmptyComponent={
          <Text className="mt-6 text-center text-sm text-gray-500">{t("chatList.noChats")}</Text>
        }
        renderItem={({ item: c }) => {
          const isA = c.partyAId === profile?.uid;
          const otherRole = isA ? c.partyBRole : c.partyARole;
          const otherRoleLabel = t(`chatModal.role.${otherRole}`, otherRole);
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("ChatThread", { chatId: c.id })}
              className="mb-2 flex-row items-center rounded-xl border border-gray-200 bg-white p-4"
            >
              <View className="mr-3 h-10 w-10 items-center justify-center rounded-full bg-orange-50">
                <Ionicons name="person" size={18} color="#ea580c" />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-medium capitalize text-gray-900">{otherRoleLabel}</Text>
                <Text className="text-xs text-gray-500">{t("chatList.lastMessage")}</Text>
              </View>
              {c.status === "locked" ? (
                <Ionicons name="lock-closed-outline" size={16} color="#9ca3af" />
              ) : (
                <Ionicons name="chevron-forward" size={18} color="#9ca3af" />
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}
