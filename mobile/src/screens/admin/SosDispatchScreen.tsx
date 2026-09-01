import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";

interface SosReport {
  id: string;
  reporterName: string;
  reporterPhone: string | null;
  type: "trapped" | "missing_person" | "flood_rescue" | "other";
  peopleCount: number | null;
  description: string;
  location: { lat: number; lng: number };
  status: "pending" | "acknowledged" | "in_progress" | "resolved";
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  trapped: "Trapped",
  missing_person: "Missing Person",
  flood_rescue: "Flood Rescue",
  other: "Other Emergency",
};

const STATUS_BADGE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-red-100", text: "text-red-800" },
  acknowledged: { bg: "bg-amber-100", text: "text-amber-800" },
  in_progress: { bg: "bg-blue-100", text: "text-blue-800" },
  resolved: { bg: "bg-gray-100", text: "text-gray-600" },
};

const NEXT_ACTION: Record<string, { label: string; next: string } | null> = {
  pending: { label: "Acknowledge", next: "acknowledged" },
  acknowledged: { label: "Start response", next: "in_progress" },
  in_progress: { label: "Mark resolved", next: "resolved" },
  resolved: null,
};

// List-only on mobile — no map (mobile maps are deferred, see "Mobile maps"
// in CLAUDE.md's Not started section). Same live dispatch-board data and
// actions as AdminSos.tsx on web, just without the map layer.
export function SosDispatchScreen() {
  const [reports, setReports] = useState<SosReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "sosRequests"), (snapshot) => {
      setReports(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SosReport[]);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const unresolved = reports
    .filter((r) => r.status !== "resolved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const resolved = reports
    .filter((r) => r.status === "resolved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function advanceStatus(id: string, nextStatus: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/sos/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: nextStatus }) });
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
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-gray-900">🆘 SOS Dispatch</Text>
        <Text className="text-sm text-gray-500">{unresolved.length} unresolved</Text>
      </View>
      <Text className="mt-1 text-sm text-gray-600">
        Life-safety reports, separate from aid requests. This board updates live.
      </Text>

      <View className="mt-4">
        {unresolved.length === 0 ? (
          <Text className="text-sm text-gray-500">No active SOS reports right now.</Text>
        ) : (
          <View style={{ gap: 10 }}>
            {unresolved.map((r) => {
              const action = NEXT_ACTION[r.status];
              const badge = STATUS_BADGE[r.status];
              return (
                <View key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
                    <View className={`rounded-full px-2 py-0.5 ${badge.bg}`}>
                      <Text className={`text-xs font-medium ${badge.text}`}>{r.status.replace("_", " ")}</Text>
                    </View>
                    <Text className="text-sm font-semibold text-gray-900">{TYPE_LABEL[r.type]}</Text>
                  </View>
                  <Text className="mt-1 text-sm text-gray-600">
                    Reported by {r.reporterName}
                    {r.reporterPhone ? ` (${r.reporterPhone})` : ""}
                  </Text>
                  {r.peopleCount != null && (
                    <Text className="mt-1 text-sm text-gray-600">{r.peopleCount} people affected</Text>
                  )}
                  {r.description ? <Text className="mt-1 text-sm text-gray-600">{r.description}</Text> : null}
                  <Text className="mt-1 text-xs text-gray-400">
                    {r.location.lat.toFixed(4)}, {r.location.lng.toFixed(4)} · {new Date(r.createdAt).toLocaleString()}
                  </Text>
                  {action && (
                    <TouchableOpacity
                      disabled={actingOn === r.id}
                      onPress={() => advanceStatus(r.id, action.next)}
                      className="mt-2 self-start rounded bg-red-600 px-3 py-1.5"
                      style={{ opacity: actingOn === r.id ? 0.5 : 1 }}
                    >
                      <Text className="text-xs font-medium text-white">
                        {actingOn === r.id ? "Updating..." : action.label}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>

      {resolved.length > 0 && (
        <View className="mt-6 rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">Resolved</Text>
          <View className="mt-2" style={{ gap: 6 }}>
            {resolved.map((r) => (
              <Text key={r.id} className="text-sm text-gray-500">
                {TYPE_LABEL[r.type]} — {r.reporterName} — resolved {new Date(r.createdAt).toLocaleDateString()}
              </Text>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
