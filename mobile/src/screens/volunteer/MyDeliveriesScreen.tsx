import { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput, Alert } from "react-native";
import * as Location from "expo-location";
import { useNavigation, type NavigationProp } from "@react-navigation/native";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { DeliveryQrCode } from "../../components/DeliveryQrCode";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { deliveryChatId } from "../../lib/deliveryChat";
import type { VolunteerTabParamList } from "../../navigation/types";

// Same gating as web's VolunteerDeliveries.tsx — chat opens once the
// delivery is actually linked (at accept) and stays viewable (read-only
// once locked) through the rest of the delivery.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);
// Same as web's NAVIGABLE_STATUSES — only while there's a real "go
// somewhere" destination (pending_acceptance has nothing yet, delivered/
// confirmed are already done).
const NAVIGABLE_STATUSES = new Set(["accepted", "picked_up"]);

interface Delivery {
  id: string;
  requestId: string;
  donationId: string;
  category: string;
  method: "self" | "volunteer";
  status: string;
  createdAt: string;
  confirmToken?: string;
  handoffVersion?: number;
  // Set when this delivery's donation was part of a multi-category drop-off
  // (see "Donation batching" in CLAUDE.md) — lets the volunteer see at a
  // glance that several of their own deliveries came from the same donor
  // visit, rather than reading as unrelated separate assignments.
  dropoffId?: string | null;
  donorName?: string;
}

interface FellowTraveller {
  deliveryId: string;
  category: string;
  originDistrict: string | null;
  destinationDistrict: string | null;
  status: string;
  sameDropoff?: boolean;
  // Same victim's other item, fulfilled by a different, unrelated donor (no
  // shared dropoffId) — see "Fellow travellers" in CLAUDE.md.
  sameRequest?: boolean;
}

interface HandoffRequest {
  id: string;
  deliveryId: string;
  fromVolunteerId: string;
  toVolunteerId: string;
  category: string;
  destinationDistrict: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

// Matches the backend's own ACTIVE_DELIVERY_STATUSES in routes/deliveries.js
// — same gating web's VolunteerDeliveries.tsx uses for this feature.
const FELLOW_TRAVELLER_STATUSES = new Set(["accepted", "picked_up"]);

const NEXT_STATUS: Record<string, string> = {
  accepted: "picked_up",
  picked_up: "delivered",
};

function actionLabel(t: TFunction): Record<string, string> {
  return {
    accepted: t("volunteerDeliveries.action.accepted"),
    picked_up: t("volunteerDeliveries.action.picked_up"),
  };
}

// Same color vocabulary as StatusBadge.tsx's own palette, just applied to
// the whole card (a colored left accent bar + a very light tint) instead of
// only the small pill — direct user ask: with several delivery cards
// stacked, the status pill alone wasn't enough to tell them apart at a
// glance while scrolling. pending_acceptance is deliberately the loudest
// (amber) since it's the one state that's actually waiting on the
// volunteer's own action (accept/reject); everything after that is already
// moving forward.
const STATUS_ACCENT: Record<string, { border: string; bg: string; bar: string }> = {
  pending_acceptance: { border: "border-amber-200", bg: "bg-amber-50/60", bar: "#f59e0b" },
  accepted: { border: "border-blue-200", bg: "bg-blue-50/60", bar: "#3b82f6" },
  rejected: { border: "border-red-200", bg: "bg-red-50/60", bar: "#dc2626" },
  picked_up: { border: "border-purple-200", bg: "bg-purple-50/60", bar: "#9333ea" },
  delivered: { border: "border-green-200", bg: "bg-green-50/60", bar: "#16a34a" },
  confirmed: { border: "border-gray-200", bg: "bg-gray-50", bar: "#6b7280" },
};

export function MyDeliveriesScreen() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const navigation = useNavigation<NavigationProp<VolunteerTabParamList>>();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<Delivery | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [fellowTravellers, setFellowTravellers] = useState<Record<string, FellowTraveller[]>>({});
  const [fellowLoading, setFellowLoading] = useState<string | null>(null);
  const [sameOriginOnly, setSameOriginOnly] = useState<Record<string, boolean>>({});
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);
  const [handoffs, setHandoffs] = useState<HandoffRequest[]>([]);
  const [handoffActionOn, setHandoffActionOn] = useState<string | null>(null);

  const load = useCallback(async () => {
    const data = await apiFetch("/api/deliveries/mine");
    setDeliveries(data);
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

  // Handoff requests (Fellow Travellers Phase 2) live, either direction —
  // sent (I'm fromVolunteerId) or received (I'm toVolunteerId). Same
  // two-query-merge pattern as web's VolunteerDeliveries.tsx.
  useEffect(() => {
    if (!profile?.uid) return;
    const sent: HandoffRequest[] = [];
    const received: HandoffRequest[] = [];

    function merge() {
      setHandoffs([...sent, ...received]);
    }

    const unsubSent = onSnapshot(
      query(collection(db, "deliveryHandoffs"), where("fromVolunteerId", "==", profile.uid)),
      (snap) => {
        sent.length = 0;
        snap.docs.forEach((d) => sent.push({ id: d.id, ...d.data() } as HandoffRequest));
        merge();
      }
    );
    const unsubReceived = onSnapshot(
      query(collection(db, "deliveryHandoffs"), where("toVolunteerId", "==", profile.uid)),
      (snap) => {
        received.length = 0;
        snap.docs.forEach((d) => received.push({ id: d.id, ...d.data() } as HandoffRequest));
        merge();
      }
    );
    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [profile?.uid]);

  // How many of the volunteer's OWN deliveries share each non-null
  // dropoffId — only worth a badge once that's more than 1. Same reasoning
  // as web's VolunteerDeliveries.tsx: a sibling item assigned to a
  // *different* volunteer shows up via the Fellow Travellers panel instead
  // (sameDropoff), not here.
  const dropoffSiblingCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deliveries) {
      if (!d.dropoffId) continue;
      counts[d.dropoffId] = (counts[d.dropoffId] || 0) + 1;
    }
    return counts;
  }, [deliveries]);

  // Same idea, keyed by requestId instead — how many of the volunteer's OWN
  // deliveries fulfill the same victim's request, whether or not those
  // items came from the same donor.
  const requestSiblingCount = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const d of deliveries) {
      counts[d.requestId] = (counts[d.requestId] || 0) + 1;
    }
    return counts;
  }, [deliveries]);

  const incomingHandoffs = useMemo(
    () => handoffs.filter((h) => h.toVolunteerId === profile?.uid && h.status === "pending"),
    [handoffs, profile?.uid]
  );
  const outgoingPendingByDelivery = useMemo(() => {
    const map: Record<string, HandoffRequest> = {};
    for (const h of handoffs) {
      if (h.fromVolunteerId === profile?.uid && h.status === "pending") map[h.deliveryId] = h;
    }
    return map;
  }, [handoffs, profile?.uid]);

  function respond(delivery: Delivery, decision: "accept" | "reject") {
    if (decision === "accept") {
      doRespond(delivery, "accept", null);
      return;
    }
    setRejectReason("");
    setRejectTarget(delivery);
  }

  function confirmReject() {
    if (!rejectTarget) return;
    const target = rejectTarget;
    setRejectTarget(null);
    doRespond(target, "reject", rejectReason.trim() || null);
  }

  async function doRespond(delivery: Delivery, decision: "accept" | "reject", reason: string | null) {
    setActingOn(delivery.id);
    try {
      await apiFetch(`/api/deliveries/${delivery.id}/${decision}`, {
        method: "PATCH",
        body: decision === "reject" ? JSON.stringify({ reason }) : undefined,
      });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  async function loadFellowTravellers(deliveryId: string) {
    setFellowLoading(deliveryId);
    try {
      const qs = sameOriginOnly[deliveryId] ? "?sameOrigin=true" : "";
      const data = await apiFetch(`/api/deliveries/${deliveryId}/fellow-travellers${qs}`);
      setFellowTravellers((prev) => ({ ...prev, [deliveryId]: data }));
    } finally {
      setFellowLoading(null);
    }
  }

  async function messageFellowTraveller(deliveryId: string, otherDeliveryId: string) {
    setStartingChatWith(otherDeliveryId);
    try {
      const { chatId } = await apiFetch(`/api/deliveries/${deliveryId}/fellow-travellers/${otherDeliveryId}/chat`, {
        method: "POST",
      });
      navigation.navigate("Messages", { screen: "ChatThread", params: { chatId } });
    } finally {
      setStartingChatWith(null);
    }
  }

  function requestHandoff(deliveryId: string, otherDeliveryId: string) {
    Alert.alert(t("volunteerDeliveries.handoffButton"), t("volunteerDeliveries.handoffConfirm"), [
      { text: t("common.cancel"), style: "cancel" },
      {
        text: t("volunteerDeliveries.handoffButton"),
        onPress: async () => {
          setHandoffActionOn(otherDeliveryId);
          try {
            await apiFetch(`/api/deliveries/${deliveryId}/handoff`, {
              method: "POST",
              body: JSON.stringify({ otherDeliveryId }),
            });
          } finally {
            setHandoffActionOn(null);
          }
        },
      },
    ]);
  }

  async function respondToHandoff(handoffId: string, decision: "accept" | "decline") {
    setHandoffActionOn(handoffId);
    try {
      await apiFetch(`/api/deliveries/handoffs/${handoffId}/${decision}`, { method: "PATCH" });
      if (decision === "accept") await load(); // the delivery now belongs to us — pull it into the list
    } finally {
      setHandoffActionOn(null);
    }
  }

  async function cancelHandoff(handoffId: string) {
    setHandoffActionOn(handoffId);
    try {
      await apiFetch(`/api/deliveries/handoffs/${handoffId}/cancel`, { method: "PATCH" });
    } finally {
      setHandoffActionOn(null);
    }
  }

  async function advanceStatus(delivery: Delivery) {
    const nextStatus = NEXT_STATUS[delivery.status];
    if (!nextStatus) return;
    setActingOn(delivery.id);

    let currentLocation: { lat: number; lng: number } | undefined;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const pos = await Location.getCurrentPositionAsync({});
        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      }
    } catch {
      // Location optional — proceed without it if denied.
    }

    try {
      await apiFetch(`/api/deliveries/${delivery.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, currentLocation }),
      });
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
      <Text className="text-2xl font-semibold text-gray-900">{t("volunteerDeliveries.title")}</Text>

      {incomingHandoffs.length > 0 && (
        <View className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <Text className="text-sm font-medium text-orange-900">{t("volunteerDeliveries.handoffIncomingTitle")}</Text>
          <View className="mt-2" style={{ gap: 8 }}>
            {incomingHandoffs.map((h) => (
              <View key={h.id} className="flex-row items-center justify-between rounded border border-orange-200 bg-white px-3 py-2">
                <Text className="flex-1 pr-2 text-sm text-gray-700">
                  {t(`categories.${h.category}`, { defaultValue: h.category })} — {h.destinationDistrict || "?"}
                </Text>
                <View className="flex-row" style={{ gap: 8 }}>
                  <TouchableOpacity
                    disabled={handoffActionOn === h.id}
                    onPress={() => respondToHandoff(h.id, "accept")}
                    accessibilityRole="button"
                    className="rounded bg-green-600 px-2.5 py-1"
                    style={{ opacity: handoffActionOn === h.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">{t("volunteerDeliveries.handoffAccept")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={handoffActionOn === h.id}
                    onPress={() => respondToHandoff(h.id, "decline")}
                    accessibilityRole="button"
                    className="rounded bg-gray-100 px-2.5 py-1"
                    style={{ opacity: handoffActionOn === h.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-gray-700">{t("volunteerDeliveries.handoffDecline")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {deliveries.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">{t("volunteerDeliveries.noDeliveries")}</Text>
      ) : (
        <View className="mt-6" style={{ gap: 12 }}>
          {deliveries.map((d) => {
            const accent = STATUS_ACCENT[d.status] || STATUS_ACCENT.confirmed;
            return (
              <View
                key={d.id}
                className={`flex-row overflow-hidden rounded-xl border ${accent.border} ${accent.bg}`}
              >
                <View style={{ width: 5, backgroundColor: accent.bar }} />
                <View className="flex-1 p-4">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-2">
                      <Text className="text-sm font-medium capitalize text-gray-900">
                        {t("volunteerDeliveries.deliveryLine", {
                          category: t(`categories.${d.category}`, { defaultValue: d.category }),
                          id: d.id.slice(0, 6),
                        })}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {t("volunteerDeliveries.requestDonationLine", {
                          requestId: d.requestId.slice(0, 6),
                          donationId: d.donationId.slice(0, 6),
                        })}
                      </Text>
                      {d.dropoffId && dropoffSiblingCount[d.dropoffId] > 1 && (
                        <Text className="text-xs text-orange-700">
                          📦{" "}
                          {t("volunteerDeliveries.dropoffBadge", {
                            count: dropoffSiblingCount[d.dropoffId],
                            donorName: d.donorName || "",
                          })}
                        </Text>
                      )}
                      {requestSiblingCount[d.requestId] > 1 && (
                        <Text className="text-xs text-blue-700">
                          🏠 {t("volunteerDeliveries.sameVictimBadge", { count: requestSiblingCount[d.requestId] })}
                        </Text>
                      )}
                    </View>
                    <StatusBadge status={d.status} />
                  </View>

                  <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                    {CHATTABLE_STATUSES.has(d.status) && (
                      <>
                        <TouchableOpacity
                          onPress={() =>
                            navigation.navigate("Messages", {
                              screen: "ChatThread",
                              params: { chatId: deliveryChatId(d.id, "donor_volunteer", d.handoffVersion) },
                            })
                          }
                          accessibilityRole="button"
                          className="rounded border border-gray-300 bg-white px-3 py-1.5"
                        >
                          <Text className="text-xs font-medium text-gray-700">💬 {t("volunteerDeliveries.chatDonor")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() =>
                            navigation.navigate("Messages", {
                              screen: "ChatThread",
                              params: { chatId: deliveryChatId(d.id, "volunteer_victim", d.handoffVersion) },
                            })
                          }
                          accessibilityRole="button"
                          className="rounded border border-gray-300 bg-white px-3 py-1.5"
                        >
                          <Text className="text-xs font-medium text-gray-700">💬 {t("volunteerDeliveries.chatVictim")}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {NAVIGABLE_STATUSES.has(d.status) && (
                      <TouchableOpacity
                        onPress={() => navigation.navigate("VolunteerNavigation", { deliveryId: d.id })}
                        accessibilityRole="button"
                        className="rounded border border-gray-300 bg-white px-3 py-1.5"
                      >
                        <Text className="text-xs font-medium text-gray-700">🧭 {t("volunteerDeliveries.navigate")}</Text>
                      </TouchableOpacity>
                    )}
                    {d.status === "pending_acceptance" && (
                      <>
                        <TouchableOpacity
                          disabled={actingOn === d.id}
                          onPress={() => respond(d, "accept")}
                          accessibilityRole="button"
                          className="rounded bg-green-600 px-3 py-1.5"
                          style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-medium text-white">{t("volunteerDeliveries.accept")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          disabled={actingOn === d.id}
                          onPress={() => respond(d, "reject")}
                          accessibilityRole="button"
                          className="rounded bg-red-100 px-3 py-1.5"
                          style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-medium text-red-700">{t("volunteerDeliveries.reject")}</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    {NEXT_STATUS[d.status] && (
                      <TouchableOpacity
                        disabled={actingOn === d.id}
                        onPress={() => advanceStatus(d)}
                        accessibilityRole="button"
                        className="rounded bg-orange-600 px-3 py-1.5"
                        style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                      >
                        <Text className="text-xs font-medium text-white">
                          {actingOn === d.id ? t("volunteerDeliveries.updating") : actionLabel(t)[d.status]}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {d.status === "delivered" && d.confirmToken && (
                    <View className="mt-4 items-center">
                      <DeliveryQrCode deliveryId={d.id} token={d.confirmToken} details={d.category} />
                    </View>
                  )}

                  {FELLOW_TRAVELLER_STATUSES.has(d.status) && (
                    <View className="mt-3 border-t border-gray-100 pt-3">
                      <View className="flex-row items-center justify-between">
                        <Text className="text-xs font-medium text-gray-600">
                          {t("volunteerDeliveries.fellowTravellersTitle")}
                        </Text>
                        <TouchableOpacity
                          onPress={() => loadFellowTravellers(d.id)}
                          disabled={fellowLoading === d.id}
                          accessibilityRole="button"
                          className="rounded border border-gray-300 bg-white px-2.5 py-1"
                          style={{ opacity: fellowLoading === d.id ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-medium text-gray-700">
                            {fellowLoading === d.id
                              ? t("common.loading")
                              : t("volunteerDeliveries.fellowTravellersFind")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      <TouchableOpacity
                        onPress={() => setSameOriginOnly((prev) => ({ ...prev, [d.id]: !prev[d.id] }))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: !!sameOriginOnly[d.id] }}
                        className="mt-1.5 flex-row items-center"
                        style={{ gap: 6 }}
                      >
                        <View
                          className={`h-4 w-4 items-center justify-center rounded border ${
                            sameOriginOnly[d.id] ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"
                          }`}
                        >
                          {sameOriginOnly[d.id] && <Text className="text-[10px] font-bold text-white">✓</Text>}
                        </View>
                        <Text className="text-xs text-gray-500">
                          {t("volunteerDeliveries.fellowTravellersSameOrigin")}
                        </Text>
                      </TouchableOpacity>

                      {outgoingPendingByDelivery[d.id] ? (
                        <View className="mt-2 flex-row items-center justify-between rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                          <Text className="flex-1 pr-2 text-xs text-amber-800">{t("volunteerDeliveries.handoffPending")}</Text>
                          <TouchableOpacity
                            disabled={handoffActionOn === outgoingPendingByDelivery[d.id].id}
                            onPress={() => cancelHandoff(outgoingPendingByDelivery[d.id].id)}
                            accessibilityRole="button"
                            className="rounded border border-amber-300 bg-white px-2 py-1"
                            style={{ opacity: handoffActionOn === outgoingPendingByDelivery[d.id].id ? 0.5 : 1 }}
                          >
                            <Text className="text-xs font-medium text-amber-800">{t("volunteerDeliveries.handoffCancel")}</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        fellowTravellers[d.id] &&
                        (fellowTravellers[d.id].length === 0 ? (
                          <Text className="mt-2 text-xs text-gray-500">
                            {t("volunteerDeliveries.fellowTravellersNone")}
                          </Text>
                        ) : (
                          <View className="mt-2" style={{ gap: 6 }}>
                            {fellowTravellers[d.id].map((ft) => (
                              <View
                                key={ft.deliveryId}
                                className={`rounded border px-2.5 py-1.5 ${
                                  ft.sameDropoff
                                    ? "border-orange-200 bg-orange-50"
                                    : ft.sameRequest
                                    ? "border-blue-200 bg-blue-50"
                                    : "border-gray-100 bg-gray-50"
                                }`}
                              >
                                <Text className="text-xs text-gray-700">
                                  {ft.sameDropoff && (
                                    <Text className="font-medium text-orange-700">
                                      📦 {t("volunteerDeliveries.sameDropoffBadge")}{" "}
                                    </Text>
                                  )}
                                  {!ft.sameDropoff && ft.sameRequest && (
                                    <Text className="font-medium text-blue-700">
                                      🏠 {t("volunteerDeliveries.sameRequestBadge")}{" "}
                                    </Text>
                                  )}
                                  {t(`categories.${ft.category}`, { defaultValue: ft.category })} ·{" "}
                                  {ft.originDistrict || "?"} → {ft.destinationDistrict || "?"}
                                </Text>
                                <View className="mt-1.5 flex-row" style={{ gap: 6 }}>
                                  <TouchableOpacity
                                    disabled={startingChatWith === ft.deliveryId}
                                    onPress={() => messageFellowTraveller(d.id, ft.deliveryId)}
                                    accessibilityRole="button"
                                    className="rounded border border-gray-300 bg-white px-2 py-1"
                                    style={{ opacity: startingChatWith === ft.deliveryId ? 0.5 : 1 }}
                                  >
                                    <Text className="text-xs font-medium text-gray-700">
                                      💬 {t("volunteerDeliveries.fellowTravellersMessage")}
                                    </Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    disabled={handoffActionOn === ft.deliveryId}
                                    onPress={() => requestHandoff(d.id, ft.deliveryId)}
                                    accessibilityRole="button"
                                    className="rounded border border-orange-300 bg-orange-50 px-2 py-1"
                                    style={{ opacity: handoffActionOn === ft.deliveryId ? 0.5 : 1 }}
                                  >
                                    <Text className="text-xs font-medium text-orange-700">
                                      {t("volunteerDeliveries.handoffButton")}
                                    </Text>
                                  </TouchableOpacity>
                                </View>
                              </View>
                            ))}
                          </View>
                        ))
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6" accessibilityViewIsModal>
          <View className="w-full max-w-sm rounded-xl bg-white p-5">
            <Text className="text-sm font-semibold text-gray-900">{t("volunteerDeliveries.rejectModalTitle")}</Text>
            <Text className="mt-1 text-xs text-gray-500">{t("volunteerDeliveries.rejectModalSubtitle")}</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder={t("volunteerDeliveries.reasonPlaceholder")}
              accessibilityLabel={t("volunteerDeliveries.reasonPlaceholder")}
              multiline
              numberOfLines={3}
              className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm"
              style={{ textAlignVertical: "top" }}
            />
            <View className="mt-4 flex-row justify-end" style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => setRejectTarget(null)} accessibilityRole="button" className="rounded px-3 py-2">
                <Text className="text-sm text-gray-600">{t("common.cancel")}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmReject} accessibilityRole="button" className="rounded bg-red-600 px-3 py-2">
                <Text className="text-sm font-medium text-white">{t("volunteerDeliveries.reject")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
