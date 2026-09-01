import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";

interface Volunteer {
  uid: string;
  name: string;
  email: string;
  available?: boolean;
}

interface Delivery {
  volunteerId: string | null;
  status: string;
}

const ACTIVE_STATUSES = ["pending_acceptance", "accepted", "picked_up"];
const COMPLETED_STATUSES = ["delivered", "confirmed"];

export function VolunteerWorkloadScreen() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/users/volunteers").then(setVolunteers);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "deliveries"), (snapshot) => {
      setDeliveries(snapshot.docs.map((doc) => doc.data() as Delivery));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const rows = useMemo(() => {
    return volunteers
      .map((v) => {
        const mine = deliveries.filter((d) => d.volunteerId === v.uid);
        const active = mine.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;
        const completed = mine.filter((d) => COMPLETED_STATUSES.includes(d.status)).length;
        const rejected = mine.filter((d) => d.status === "rejected").length;
        return { ...v, active, completed, rejected, total: mine.length };
      })
      .sort((a, b) => b.active - a.active || b.total - a.total);
  }, [volunteers, deliveries]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Volunteer Workload</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Active deliveries per volunteer, busiest first — so no one gets overloaded while others sit idle.
      </Text>

      {rows.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No volunteers registered yet.</Text>
      ) : (
        <View className="mt-4" style={{ gap: 10 }}>
          {rows.map((v) => (
            <View key={v.uid} className="rounded-xl border border-gray-200 bg-white p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-medium text-gray-900">{v.name}</Text>
                  <Text className="text-xs text-gray-500">{v.email}</Text>
                </View>
                <View className={`rounded-full px-2 py-0.5 ${v.available !== false ? "bg-green-100" : "bg-gray-100"}`}>
                  <Text className={`text-xs font-medium ${v.available !== false ? "text-green-800" : "text-gray-600"}`}>
                    {v.available !== false ? "Available" : "Unavailable"}
                  </Text>
                </View>
              </View>
              <View className="mt-2 flex-row flex-wrap" style={{ gap: 12 }}>
                <View>
                  <Text className="text-xs text-gray-400">Active</Text>
                  {v.active === 0 ? (
                    <View className="mt-0.5 self-start rounded-full bg-gray-100 px-2 py-0.5">
                      <Text className="text-xs font-medium text-gray-600">Idle</Text>
                    </View>
                  ) : v.active >= 3 ? (
                    <View className="mt-0.5 self-start rounded-full bg-amber-100 px-2 py-0.5">
                      <Text className="text-xs font-medium text-amber-800">{v.active} — High load</Text>
                    </View>
                  ) : (
                    <Text className="text-sm font-medium text-gray-900">{v.active}</Text>
                  )}
                </View>
                <View>
                  <Text className="text-xs text-gray-400">Completed</Text>
                  <Text className="text-sm text-gray-900">{v.completed}</Text>
                </View>
                <View>
                  <Text className="text-xs text-gray-400">Rejected</Text>
                  <Text className="text-sm text-gray-900">{v.rejected}</Text>
                </View>
                <View>
                  <Text className="text-xs text-gray-400">Total</Text>
                  <Text className="text-sm text-gray-500">{v.total}</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
