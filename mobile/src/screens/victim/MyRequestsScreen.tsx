import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl } from "react-native";
import { useTranslation } from "react-i18next";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { QrScanModal } from "../../components/QrScanModal";
import { deliveryChatId } from "../../lib/deliveryChat";
import type { VictimTabParamList } from "../../navigation/types";

// Chats open once the delivery is actually linked (immediately for
// self-delivery, once a volunteer accepts for volunteer-delivery) and stay
// viewable (read-only once locked) through the rest of the delivery — same
// gating web's VictimMyRequests.tsx already uses.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface RequestItem {
  category: string;
  quantity: number;
  status: string;
  donationId: string | null;
}

interface AidRequest {
  id: string;
  disasterType: string;
  items: RequestItem[];
  severity: string;
  status: string;
  priorityScore: number;
  createdAt: string;
}

interface Delivery {
  id: string;
  category: string;
  donationId: string;
  status: string;
  method: "self" | "volunteer";
  handoffVersion?: number;
}

export function MyRequestsScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<VictimTabParamList>>();
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);

  const load = useCallback(async () => {
    const data: AidRequest[] = await apiFetch("/api/requests/mine");
    setRequests(data);

    const trackable = data.filter((r) => (r.items || []).some((item) => item.status !== "pending"));
    const results = await Promise.all(
      trackable.map((r) => apiFetch(`/api/deliveries/by-request/${r.id}`).then((d) => [r.id, d as Delivery[]] as const))
    );
    const deliveryMap: Record<string, Delivery[]> = {};
    results.forEach(([requestId, list]) => {
      deliveryMap[requestId] = list;
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

  async function handleScan(decodedText: string) {
    setScanning(false);
    let payload: { deliveryId?: string; token?: string };
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setMessage(t("victimMyRequests.invalidQr", "That QR code isn't a valid confirmation code."));
      return;
    }
    if (!payload.deliveryId || !payload.token) {
      setMessage(t("victimMyRequests.invalidQr", "That QR code isn't a valid confirmation code."));
      return;
    }

    setConfirmingId(payload.deliveryId);
    setMessage("");
    try {
      await apiFetch(`/api/deliveries/${payload.deliveryId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ token: payload.token }),
      });
      setMessage(t("victimMyRequests.deliveryConfirmedThanks"));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("victimMyRequests.confirmFailed", "Failed to confirm delivery."));
    } finally {
      setConfirmingId(null);
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
    <View className="flex-1 bg-gray-50">
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        <Text className="text-2xl font-semibold text-gray-900">{t("victimMyRequests.title")}</Text>

        {message ? (
          <View className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-2">
            <Text className="text-sm text-green-800">{message}</Text>
          </View>
        ) : null}

        {requests.length === 0 ? (
          <Text className="mt-4 text-sm text-gray-500">{t("victimMyRequests.noRequests")}</Text>
        ) : (
          <View className="mt-6" style={{ gap: 12 }}>
            {requests.map((r) => {
              const requestDeliveries = deliveries[r.id] || [];
              return (
                <View key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text className="text-sm font-medium capitalize text-gray-900">
                        {t(`disasterTypes.${r.disasterType}`, r.disasterType)}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {t("victimRequestForm.severity")}: {t(`severities.${r.severity}`, r.severity)} ·{" "}
                        {new Date(r.createdAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <StatusBadge status={r.status} />
                  </View>

                  <View className="mt-3 border-t border-gray-100">
                    {(r.items || []).map((item) => {
                      const delivery = requestDeliveries.find(
                        (d) => d.category === item.category && d.donationId === item.donationId
                      );
                      return (
                        <View
                          key={item.category}
                          className="flex-row items-center justify-between border-b border-gray-100 py-2"
                        >
                          <View>
                            <Text className="text-sm capitalize text-gray-700">
                              {t(`categories.${item.category}`, item.category)} ×{item.quantity}
                            </Text>
                            {delivery && (
                              <Text className="text-[11px] text-gray-400">
                                {t("victimMyRequests.deliveryNumber", { id: delivery.id.slice(0, 6) })}
                              </Text>
                            )}
                          </View>
                          <View className="flex-row items-center" style={{ gap: 8 }}>
                            {delivery && CHATTABLE_STATUSES.has(delivery.status) && (
                              <TouchableOpacity
                                onPress={() =>
                                  navigation.navigate("Messages", {
                                    screen: "ChatThread",
                                    params: {
                                      chatId: deliveryChatId(
                                        delivery.id,
                                        delivery.method === "self" ? "donor_victim" : "volunteer_victim",
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
                                    ? t("victimMyRequests.chatWithDonor")
                                    : t("victimMyRequests.chatWithVolunteer")}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {item.status === "pending" && (
                              <Text className="text-xs text-gray-400">{t("victimMyRequests.awaitingMatch")}</Text>
                            )}
                            {item.status === "matched" && !delivery && (
                              <Text className="text-xs text-gray-400">{t("victimMyRequests.awaitingVolunteer")}</Text>
                            )}
                            {item.status === "matched" && delivery && delivery.status === "delivered" && (
                              <TouchableOpacity
                                disabled={confirmingId === delivery.id}
                                onPress={() => setScanning(true)}
                                className="rounded bg-green-600 px-3 py-1"
                                style={{ opacity: confirmingId === delivery.id ? 0.5 : 1 }}
                              >
                                <Text className="text-xs font-medium text-white">
                                  {confirmingId === delivery.id
                                    ? t("victimMyRequests.confirming")
                                    : t("victimMyRequests.scanToConfirm")}
                                </Text>
                              </TouchableOpacity>
                            )}
                            {item.status === "matched" && delivery && delivery.status !== "delivered" && (
                              <StatusBadge status={delivery.status} />
                            )}
                            {item.status === "delivered" && (
                              <Text className="text-xs font-medium text-green-700">
                                {t("victimMyRequests.confirmed")}
                              </Text>
                            )}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {scanning && <QrScanModal onScan={handleScan} onClose={() => setScanning(false)} />}
    </View>
  );
}
