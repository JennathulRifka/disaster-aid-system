import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { DeliveryQrCode } from "../../components/DeliveryQrCode";

interface Donation {
  id: string;
  category: string;
  quantity: string;
  status: string;
  deliveryMethod: "self" | "volunteer";
  assignedDeliveryId: string | null;
  deliveryStatus: string | null;
  createdAt: string;
}

interface Delivery {
  id: string;
  confirmToken?: string;
}

export function MyDonationsScreen() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data: Donation[] = await apiFetch("/api/donations/mine");
    setDonations(data);

    const readyForQr = data.filter((d) => d.deliveryMethod === "self" && d.deliveryStatus === "delivered");
    const results = await Promise.all(
      readyForQr.map((d) => apiFetch(`/api/deliveries/by-donation/${d.id}`).then((dv) => [d.id, dv] as const))
    );
    const deliveryMap: Record<string, Delivery> = {};
    results.forEach(([donationId, delivery]) => {
      if (delivery) deliveryMap[donationId] = delivery;
    });
    setDeliveries(deliveryMap);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function markDelivered(donation: Donation) {
    if (!donation.assignedDeliveryId) return;
    setActingOn(donation.id);
    try {
      await apiFetch(`/api/deliveries/${donation.assignedDeliveryId}/self-deliver`, { method: "PATCH" });
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
    <ScrollView
      className="flex-1 bg-gray-50"
      contentContainerStyle={{ padding: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text className="text-2xl font-semibold text-gray-900">My Donations</Text>

      {donations.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">You haven't registered any donations yet.</Text>
      ) : (
        <View className="mt-6" style={{ gap: 12 }}>
          {donations.map((d) => {
            const delivery = deliveries[d.id];
            return (
              <View key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-medium capitalize text-gray-900">
                      {d.category} — {d.quantity}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {d.deliveryMethod === "self" ? "Self-delivery" : "Volunteer"} · Registered{" "}
                      {new Date(d.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <View className="items-end" style={{ gap: 6 }}>
                    <StatusBadge status={d.status} />
                    {d.deliveryMethod === "self" && d.deliveryStatus === "accepted" && (
                      <TouchableOpacity
                        disabled={actingOn === d.id}
                        onPress={() => markDelivered(d)}
                        className="rounded bg-green-600 px-3 py-1"
                        style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-medium text-white">
                          {actingOn === d.id ? "Updating..." : "Mark as delivered"}
                        </Text>
                      </TouchableOpacity>
                    )}
                    {d.deliveryStatus && d.deliveryStatus !== "accepted" && <StatusBadge status={d.deliveryStatus} />}
                  </View>
                </View>

                {d.deliveryMethod === "self" && d.deliveryStatus === "delivered" && delivery?.confirmToken && (
                  <View className="mt-4 items-center">
                    <DeliveryQrCode deliveryId={delivery.id} token={delivery.confirmToken} />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
