import { useEffect, useState } from "react";
import { View, Text, FlatList, TouchableOpacity, ActivityIndicator } from "react-native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Ionicons } from "@expo/vector-icons";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { apiFetch } from "../../lib/api";

interface NotificationDoc {
  id: string;
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

function timeAgo(iso: string, t: TFunction): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return t("notifications.justNow");
  if (minutes < 60) return t("notifications.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("notifications.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return t("notifications.daysAgo", { count: days });
}

/**
 * The in-app notification history the "Notifications" tab needs — replaces
 * the ad-hoc "just a live toast while the app happens to be open" behavior
 * with an actual persisted, browsable list. Reads live via onSnapshot (see
 * server/src/utils/notifications.js — every existing push trigger point
 * already writes here, so this is populated with zero new call sites).
 * Marking read/unread goes through the Express API rather than a direct
 * client write, matching every other collection in this app that's
 * live-read but API-written.
 */
export function NotificationsScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [notifications, setNotifications] = useState<NotificationDoc[] | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, "notifications"), where("uid", "==", profile.uid));
    const unsubscribe = onSnapshot(q, (snap) => {
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as NotificationDoc);
      data.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setNotifications(data);
    });
    return unsubscribe;
  }, [profile]);

  const loading = notifications === null;
  const unreadCount = loading ? 0 : notifications.filter((n) => !n.read).length;

  async function handlePress(n: NotificationDoc) {
    if (!n.read) {
      apiFetch(`/api/notifications/${n.id}/read`, { method: "PATCH" }).catch(() => {});
    }
  }

  async function handleMarkAllRead() {
    apiFetch("/api/notifications/mark-all-read", { method: "PATCH" }).catch(() => {});
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {unreadCount > 0 && (
        <View className="flex-row items-center justify-between border-b border-gray-100 bg-white px-4 py-3">
          <Text className="text-xs text-gray-500">{t("notifications.unreadCount", { count: unreadCount })}</Text>
          <TouchableOpacity onPress={handleMarkAllRead} accessibilityRole="button">
            <Text className="text-xs font-medium text-orange-700">{t("notifications.markAllRead")}</Text>
          </TouchableOpacity>
        </View>
      )}

      <FlatList
        data={notifications}
        keyExtractor={(n) => n.id}
        contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        ListEmptyComponent={
          <View className="mt-10 items-center">
            <Ionicons name="notifications-off-outline" size={28} color="#9ca3af" />
            <Text className="mt-2 text-center text-sm text-gray-500">{t("notifications.empty")}</Text>
          </View>
        }
        renderItem={({ item: n }) => (
          <TouchableOpacity
            onPress={() => handlePress(n)}
            accessibilityRole="button"
            // The read/unread state is otherwise conveyed purely by
            // background tint + a small colored dot — neither reaches a
            // screen reader on their own, so it's stated explicitly here.
            accessibilityLabel={`${n.read ? "" : "Unread. "}${n.title}${n.body ? ". " + n.body : ""}`}
            className={`mb-2 flex-row items-start rounded-xl border p-4 ${
              n.read ? "border-gray-200 bg-white" : "border-orange-200 bg-orange-50"
            }`}
          >
            {!n.read && (
              <View
                className="mr-3 mt-1.5 h-2 w-2 rounded-full bg-orange-600"
                importantForAccessibility="no"
                accessibilityElementsHidden
              />
            )}
            <View className="flex-1" style={{ marginLeft: n.read ? 20 : 0 }}>
              <Text className={`text-sm ${n.read ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>
                {n.title}
              </Text>
              {n.body ? <Text className="mt-0.5 text-xs text-gray-500">{n.body}</Text> : null}
              <Text className="mt-1 text-[10px] text-gray-400">{timeAgo(n.createdAt, t)}</Text>
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}
