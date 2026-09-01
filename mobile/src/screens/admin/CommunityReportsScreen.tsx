import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { apiFetch } from "../../lib/api";

interface CommunityReport {
  id: string;
  reporterName: string;
  type: "road_closure" | "water_level" | "other";
  description: string;
  district: string;
  status: "unverified" | "verified" | "dismissed";
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  road_closure: "Road closure",
  water_level: "Water level / flooding",
  other: "Other condition",
};

export function CommunityReportsScreen() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activateChecked, setActivateChecked] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    setReports(await apiFetch("/api/community-reports"));
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleVerify(id: string, approve: boolean) {
    setActingOn(id);
    try {
      await apiFetch(`/api/community-reports/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ approve, activateDistrict: approve ? !!activateChecked[id] : false }),
      });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  const unverified = reports.filter((r) => r.status === "unverified");
  const decided = reports.filter((r) => r.status !== "unverified");

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Community Reports</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Road closures and water conditions reported by volunteers. Verify before they're shown publicly —
        verifying can also declare the district an active emergency in one step.
      </Text>

      <View className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
        <Text className="text-sm font-semibold text-gray-900">Awaiting review</Text>
        {unverified.length === 0 ? (
          <Text className="mt-2 text-sm text-gray-500">No reports waiting for review.</Text>
        ) : (
          <View className="mt-2" style={{ gap: 10 }}>
            {unverified.map((r) => (
              <View key={r.id} className="rounded border border-gray-200 p-3">
                <Text className="text-sm font-semibold text-gray-900">
                  {TYPE_LABEL[r.type]} — {r.district}
                </Text>
                <Text className="mt-1 text-sm text-gray-700">{r.description}</Text>
                <Text className="mt-1 text-xs text-gray-400">
                  Reported by {r.reporterName} — {new Date(r.createdAt).toLocaleString()}
                </Text>
                <TouchableOpacity
                  onPress={() => setActivateChecked((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}
                  className="mt-2 flex-row items-center"
                  style={{ gap: 8 }}
                >
                  <View
                    className={`h-4 w-4 items-center justify-center rounded border ${
                      activateChecked[r.id] ? "border-orange-600 bg-orange-600" : "border-gray-400"
                    }`}
                  >
                    {activateChecked[r.id] && <Text className="text-[10px] font-bold text-white">✓</Text>}
                  </View>
                  <Text className="text-xs text-gray-600">Also declare {r.district} an active emergency</Text>
                </TouchableOpacity>
                <View className="mt-2 flex-row" style={{ gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => handleVerify(r.id, true)}
                    disabled={actingOn === r.id}
                    className="rounded bg-green-600 px-3 py-1.5"
                    style={{ opacity: actingOn === r.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">
                      {actingOn === r.id ? "Saving..." : "Verify"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleVerify(r.id, false)}
                    disabled={actingOn === r.id}
                    className="rounded border border-gray-300 px-3 py-1.5"
                  >
                    <Text className="text-xs font-medium text-gray-700">Dismiss</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>

      {decided.length > 0 && (
        <View className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
          <Text className="text-sm font-semibold text-gray-900">Reviewed</Text>
          <View className="mt-2" style={{ gap: 6 }}>
            {decided.map((r) => (
              <Text key={r.id} className="border-b border-gray-100 pb-2 text-sm text-gray-600">
                {r.status} — {TYPE_LABEL[r.type]} — {r.district} — {r.description}
              </Text>
            ))}
          </View>
        </View>
      )}
    </ScrollView>
  );
}
