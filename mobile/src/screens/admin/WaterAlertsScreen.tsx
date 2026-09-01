import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { apiFetch } from "../../lib/api";

interface PendingAlert {
  id: string;
  station: string;
  basin: string;
  district: string;
  status: "alert" | "minor_flood" | "major_flood";
  waterLevel: number | null;
  message: string;
  createdAt: string;
}

interface SentAlert {
  id: string;
  station: string;
  basin: string;
  district: string;
  status: "alert" | "minor_flood" | "major_flood";
  notifiedCount: number;
  source: "auto" | "admin_approved";
  approvedBy: string | null;
  sentAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  alert: "Alert level",
  minor_flood: "Minor flood",
  major_flood: "Major flood",
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  alert: { bg: "bg-amber-100", text: "text-amber-800" },
  minor_flood: { bg: "bg-orange-100", text: "text-orange-800" },
  major_flood: { bg: "bg-red-100", text: "text-red-800" },
};

export function WaterAlertsScreen() {
  const [autoSend, setAutoSend] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [pending, setPending] = useState<PendingAlert[]>([]);
  const [sent, setSent] = useState<SentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [settings, pendingList, sentList] = await Promise.all([
      apiFetch("/api/water-alerts/settings"),
      apiFetch("/api/water-alerts/pending"),
      apiFetch("/api/water-alerts/sent"),
    ]);
    setAutoSend(settings.autoSend);
    setPending(pendingList);
    setSent(sentList);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle() {
    setSavingToggle(true);
    try {
      const result = await apiFetch("/api/water-alerts/settings", {
        method: "PATCH",
        body: JSON.stringify({ autoSend: !autoSend }),
      });
      setAutoSend(result.autoSend);
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleApprove(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/water-alerts/pending/${id}/approve`, { method: "POST" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  async function handleReject(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/water-alerts/pending/${id}/reject`, { method: "POST" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Water Level Area Alerts</Text>
      <Text className="mt-1 text-sm text-gray-600">
        When a river gauge rises into alert/minor-flood/major-flood status, victims in the matching district can
        be notified automatically or only after you approve it.
      </Text>

      <View className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <View className="flex-row items-center justify-between">
          <View className="flex-1 pr-2">
            <Text className="text-sm font-semibold text-gray-900">Auto-send</Text>
            <Text className="mt-1 text-xs text-gray-500">
              {autoSend ? "On — notifies matching victims immediately." : "Off — creates a pending alert to approve."}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleToggle}
            disabled={savingToggle}
            className={`rounded-full px-4 py-2 ${autoSend ? "bg-green-600" : "bg-gray-200"}`}
            style={{ opacity: savingToggle ? 0.5 : 1 }}
          >
            <Text className={`text-sm font-medium ${autoSend ? "text-white" : "text-gray-700"}`}>
              {savingToggle ? "Saving..." : autoSend ? "On" : "Off"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <Text className="text-sm font-semibold text-gray-900">Pending review</Text>
        {pending.length === 0 ? (
          <Text className="mt-2 text-sm text-gray-500">No escalations waiting for review right now.</Text>
        ) : (
          <View className="mt-2" style={{ gap: 10 }}>
            {pending.map((p) => (
              <View key={p.id} className="rounded border border-gray-200 p-3">
                <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
                  <View className={`rounded-full px-2 py-0.5 ${STATUS_BADGE[p.status].bg}`}>
                    <Text className={`text-xs font-medium ${STATUS_BADGE[p.status].text}`}>
                      {STATUS_LABEL[p.status]}
                    </Text>
                  </View>
                  <Text className="text-sm font-medium text-gray-900">
                    {p.station} ({p.basin}) → {p.district}
                  </Text>
                </View>
                <Text className="mt-1 text-sm text-gray-600">{p.message}</Text>
                <View className="mt-2 flex-row" style={{ gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => handleApprove(p.id)}
                    disabled={actingOn === p.id}
                    className="rounded bg-orange-600 px-3 py-1.5"
                    style={{ opacity: actingOn === p.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">
                      {actingOn === p.id ? "Sending..." : "Approve & send"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleReject(p.id)}
                    disabled={actingOn === p.id}
                    className="rounded border border-gray-300 px-3 py-1.5"
                  >
                    <Text className="text-xs font-medium text-gray-700">Reject</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {sent.length > 0 && (
        <View className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">Sent history</Text>
          <View className="mt-2" style={{ gap: 8 }}>
            {sent.map((s) => (
              <View key={s.id} className="border-b border-gray-100 pb-2">
                <Text className="text-sm font-medium text-gray-900">
                  {s.station} → {s.district} ({s.notifiedCount} notified)
                </Text>
                <Text className="text-xs text-gray-400">
                  {s.source === "auto" ? "Auto-sent" : `Approved by ${s.approvedBy}`} —{" "}
                  {new Date(s.sentAt).toLocaleString()}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
