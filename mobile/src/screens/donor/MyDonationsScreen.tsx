import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { DeliveryQrCode } from "../../components/DeliveryQrCode";
import { deliveryChatId } from "../../lib/deliveryChat";
import type { DonorTabParamList } from "../../navigation/types";

const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface Donation {
  id: string;
  category: string;
  quantity: string;
  quantityValue?: number;
  remainingQuantity?: number;
  status: string;
  deliveryMethod: "self" | "volunteer";
  createdAt: string;
}

interface Delivery {
  id: string;
  donationId: string;
  status: string;
  method: "self" | "volunteer";
  allocatedQuantity?: number;
  confirmToken?: string;
  handoffVersion?: number;
}

// A donation can now have more than one delivery over its lifetime — once it
// has leftover remainingQuantity, admin can match it again for a different
// request (see "Donation leftover-quantity tracking" in CLAUDE.md).
// GET /by-donation/:id returns every delivery, not just one.
export function MyDonationsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<DonorTabParamList>>();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [deliveriesByDonation, setDeliveriesByDonation] = useState<Record<string, Delivery[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data: Donation[] = await apiFetch("/api/donations/mine");
    setDonations(data);

    const results = await Promise.all(
      data.map((d) => apiFetch(`/api/deliveries/by-donation/${d.id}`).then((list: Delivery[]) => [d.id, list] as const))
    );
    const map: Record<string, Delivery[]> = {};
    results.forEach(([donationId, list]) => {
      map[donationId] = list;
    });
    setDeliveriesByDonation(map);
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

  async function markDelivered(deliveryId: string) {
    setActingOn(deliveryId);
    try {
      await apiFetch(`/api/deliveries/${deliveryId}/self-deliver`, { method: "PATCH" });
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
      <Text className="text-2xl font-semibold text-gray-900">{t("donorMyDonations.title")}</Text>

      {donations.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">{t("donorMyDonations.noDonations")}</Text>
      ) : (
        <View className="mt-6" style={{ gap: 12 }}>
          {donations.map((d) => {
            const deliveries = deliveriesByDonation[d.id] || [];
            return (
              <View key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <View className="flex-row items-center justify-between">
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-medium capitalize text-gray-900">
                      {t(`categories.${d.category}`, { defaultValue: d.category })} — {d.quantity}
                    </Text>
                    <Text className="text-xs text-gray-500">
                      {d.deliveryMethod === "self" ? t("donorMyDonations.selfDelivery") : t("donorMyDonations.volunteer")} ·{" "}
                      {t("donorMyDonations.registered")} {new Date(d.createdAt).toLocaleDateString()}
                    </Text>
                  </View>
                  <StatusBadge status={d.status} />
                </View>

                {typeof d.remainingQuantity === "number" && d.remainingQuantity > 0 && (
                  <Text className="mt-2 text-xs text-green-700">
                    {t("donorMyDonations.remainingAvailable", { count: d.remainingQuantity })}
                  </Text>
                )}

                {deliveries.length === 0 ? (
                  <Text className="mt-2 text-xs text-gray-400">{t("donorMyDonations.notMatchedYet")}</Text>
                ) : (
                  <View className="mt-3 border-t border-gray-100 pt-3" style={{ gap: 8 }}>
                    {deliveries.map((delivery) => (
                      <View key={delivery.id} className="flex-row items-center justify-between" style={{ gap: 8 }}>
                        <View className="flex-row items-center" style={{ gap: 8 }}>
                          <StatusBadge status={delivery.status} />
                          {typeof delivery.allocatedQuantity === "number" && (
                            <Text className="text-xs text-gray-500">
                              {t("donorMyDonations.allocatedAmount", { count: delivery.allocatedQuantity })}
                            </Text>
                          )}
                        </View>
                        <View className="flex-row items-center" style={{ gap: 6 }}>
                          {CHATTABLE_STATUSES.has(delivery.status) && (
                            <TouchableOpacity
                              onPress={() =>
                                navigation.navigate("Messages", {
                                  screen: "ChatThread",
                                  params: {
                                    chatId: deliveryChatId(
                                      delivery.id,
                                      delivery.method === "self" ? "donor_victim" : "donor_volunteer",
                                      delivery.handoffVersion
                                    ),
                                  },
                                })
                              }
                              className="rounded border border-gray-300 px-2 py-1"
                            >
                              <Text className="text-xs font-medium text-gray-700">
                                💬{" "}
                                {delivery.method === "self"
                                  ? t("donorMyDonations.chatWithVictim")
                                  : t("donorMyDonations.chatWithVolunteer")}
                              </Text>
                            </TouchableOpacity>
                          )}
                          {delivery.method === "self" && delivery.status === "accepted" && (
                            <TouchableOpacity
                              disabled={actingOn === delivery.id}
                              onPress={() => markDelivered(delivery.id)}
                              className="rounded bg-green-600 px-3 py-1"
                              style={{ opacity: actingOn === delivery.id ? 0.5 : 1 }}
                            >
                              <Text className="text-xs font-medium text-white">
                                {actingOn === delivery.id ? t("donorMyDonations.updating") : t("donorMyDonations.markDelivered")}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                    {deliveries
                      .filter((delivery) => delivery.method === "self" && delivery.status === "delivered" && delivery.confirmToken)
                      .map((delivery) => (
                        <View key={`${delivery.id}-qr`} className="items-center pt-2">
                          <DeliveryQrCode
                            deliveryId={delivery.id}
                            token={delivery.confirmToken as string}
                            details={t(`categories.${d.category}`, { defaultValue: d.category })}
                          />
                        </View>
                      ))}
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
