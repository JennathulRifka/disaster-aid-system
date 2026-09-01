import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";

interface RequestItem {
  category: string;
  quantity: number;
}

interface AidRequest {
  id: string;
  victimName: string;
  disasterType: string;
  items: RequestItem[];
  severity: string;
  peopleAffected: number;
  status: string;
  priorityScore: number;
  possibleDuplicate?: boolean;
  createdAt: string;
}

// Simplified mobile admin view — desktop-only conveniences (filters, bulk
// select, CSV/PDF export, case notes) stay on web where the dense table
// layout actually fits; this is the "review and act" core.
export function AidRequestsScreen() {
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "aidRequests"), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as AidRequest)
        .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      setRequests(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function handleVerify(id: string, approve: boolean) {
    setActingOn(id);
    try {
      await apiFetch(`/api/requests/${id}/verify`, { method: "PATCH", body: JSON.stringify({ approve }) });
      // No manual refetch — the onSnapshot listener above picks up the change.
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
      <Text className="text-2xl font-semibold text-gray-900">Aid Requests</Text>
      <Text className="mt-1 text-xs text-gray-500">Sorted by priority score, highest first</Text>

      {requests.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No requests yet.</Text>
      ) : (
        <View className="mt-4" style={{ gap: 12 }}>
          {requests.map((r) => (
            <View key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <View className="rounded bg-gray-900 px-2 py-1">
                    <Text className="text-xs font-semibold text-white">{r.priorityScore?.toFixed(0)}</Text>
                  </View>
                  <View>
                    <Text className="text-sm font-medium text-gray-900">{r.victimName}</Text>
                    <Text className="text-xs capitalize text-gray-500">{r.disasterType}</Text>
                  </View>
                </View>
                <StatusBadge status={r.status} />
              </View>

              <View className="mt-2 flex-row flex-wrap" style={{ gap: 4 }}>
                {(r.items || []).map((item) => (
                  <View key={item.category} className="rounded border border-gray-200 px-2 py-0.5">
                    <Text className="text-xs capitalize text-gray-600">
                      {item.category.replace("_", " ")} ×{item.quantity}
                    </Text>
                  </View>
                ))}
              </View>

              <Text className="mt-2 text-xs text-gray-500">
                Severity: <Text className="capitalize">{r.severity}</Text> · {r.peopleAffected} affected
              </Text>

              {r.possibleDuplicate && (
                <View className="mt-2 self-start rounded-full bg-orange-100 px-2 py-0.5">
                  <Text className="text-xs font-medium text-orange-800">⚠ Possible duplicate household</Text>
                </View>
              )}
              {(r.items || []).some((item) => item.category === "medicine") && (
                <View className="mt-2 self-start rounded-full bg-rose-100 px-2 py-0.5">
                  <Text className="text-xs font-medium text-rose-800">⚕ Contains medicine — review</Text>
                </View>
              )}

              {r.status === "pending" && (
                <View className="mt-3 flex-row" style={{ gap: 8 }}>
                  <TouchableOpacity
                    disabled={actingOn === r.id}
                    onPress={() => handleVerify(r.id, true)}
                    className="rounded bg-green-600 px-3 py-1.5"
                    style={{ opacity: actingOn === r.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">Approve</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={actingOn === r.id}
                    onPress={() => handleVerify(r.id, false)}
                    className="rounded bg-red-100 px-3 py-1.5"
                    style={{ opacity: actingOn === r.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-red-700">Reject</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
