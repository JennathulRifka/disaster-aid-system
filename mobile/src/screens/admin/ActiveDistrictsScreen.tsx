import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { DISTRICTS } from "../../lib/districts";

interface ActiveDistrict {
  id: string;
  district: string;
  activatedByName: string;
  sourceAlertTitle: string | null;
}

export function ActiveDistrictsScreen() {
  const [active, setActive] = useState<ActiveDistrict[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "activeDistricts"), (snapshot) => {
      setActive(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ActiveDistrict));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const activeByName = new Map(active.map((a) => [a.district, a]));

  async function activate(district: string) {
    setActingOn(district);
    try {
      await apiFetch("/api/active-districts", { method: "POST", body: JSON.stringify({ district }) });
    } finally {
      setActingOn(null);
    }
  }

  async function deactivate(district: string) {
    setActingOn(district);
    try {
      await apiFetch(`/api/active-districts/${encodeURIComponent(district)}`, { method: "DELETE" });
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
      <Text className="text-2xl font-semibold text-gray-900">Active Emergency Districts</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Mark specific districts as an active emergency. Victim submissions are never blocked either way — this
        only drives the soft in-area note and the public emergency banner.
      </Text>

      <View className="mt-4" style={{ gap: 8 }}>
        {DISTRICTS.map((d) => {
          const record = activeByName.get(d.name);
          const isActive = Boolean(record);
          return (
            <View
              key={d.name}
              className={`rounded-xl border p-4 ${isActive ? "border-red-200 bg-red-50" : "border-gray-200 bg-white"}`}
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-medium text-gray-900">{d.name}</Text>
                  {isActive && (
                    <Text className="mt-0.5 text-xs text-gray-500">
                      By {record?.activatedByName || "—"} · {record?.sourceAlertTitle || "Manual"}
                    </Text>
                  )}
                </View>
                {isActive ? (
                  <TouchableOpacity
                    disabled={actingOn === d.name}
                    onPress={() => deactivate(d.name)}
                    className="rounded bg-gray-100 px-3 py-1.5"
                    style={{ opacity: actingOn === d.name ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-gray-700">Deactivate</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    disabled={actingOn === d.name}
                    onPress={() => activate(d.name)}
                    className="rounded bg-red-600 px-3 py-1.5"
                    style={{ opacity: actingOn === d.name ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">Mark active</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}
