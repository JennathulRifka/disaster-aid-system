import { useCallback, useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, RefreshControl, Modal, TextInput } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";
import { DeliveryQrCode } from "../../components/DeliveryQrCode";

const REPORT_TYPE_LABEL: Record<string, string> = {
  road_closure: "Road closure",
  water_level: "Water level / flooding",
  other: "Other condition",
};

interface Delivery {
  id: string;
  requestId: string;
  donationId: string;
  status: string;
  createdAt: string;
  confirmToken?: string;
}

const NEXT_STATUS: Record<string, string> = {
  accepted: "picked_up",
  picked_up: "delivered",
};

const ACTION_LABEL: Record<string, string> = {
  accepted: "Mark as picked up",
  picked_up: "Mark as delivered",
};

export function MyDeliveriesScreen() {
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [rejectTarget, setRejectTarget] = useState<Delivery | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [reportType, setReportType] = useState<"road_closure" | "water_level" | "other">("road_closure");
  const [reportDescription, setReportDescription] = useState("");
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportLocationStatus, setReportLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">(
    "idle"
  );
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState("");

  const load = useCallback(async () => {
    const data = await apiFetch("/api/deliveries/mine");
    setDeliveries(data);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    apiFetch("/api/users/me").then((me) => {
      setAvailable(me.available !== false);
      setMyLocation(me.location || null);
    });
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function toggleAvailability() {
    if (available === null) return;
    const next = !available;
    setSavingAvailability(true);
    try {
      await apiFetch("/api/users/availability", { method: "PATCH", body: JSON.stringify({ available: next }) });
      setAvailable(next);
    } finally {
      setSavingAvailability(false);
    }
  }

  async function updateMyLocation() {
    setLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      await apiFetch("/api/users/location", { method: "PATCH", body: JSON.stringify({ location }) });
      setMyLocation(location);
      setLocationStatus("idle");
    } catch {
      setLocationStatus("error");
    }
  }

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

  async function captureReportLocation() {
    setReportLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setReportLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setReportLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setReportLocationStatus("captured");
    } catch {
      setReportLocationStatus("error");
    }
  }

  async function submitReport() {
    if (!reportLocation || !reportDescription.trim()) return;
    setSubmittingReport(true);
    setReportError("");
    try {
      await apiFetch("/api/community-reports", {
        method: "POST",
        body: JSON.stringify({ type: reportType, description: reportDescription.trim(), location: reportLocation }),
      });
      setReportSent(true);
      setReportDescription("");
      setReportLocation(null);
      setReportLocationStatus("idle");
    } catch (err: any) {
      setReportError(err.message || "Failed to submit report.");
    } finally {
      setSubmittingReport(false);
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
      <Text className="text-2xl font-semibold text-gray-900">My Deliveries</Text>

      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
        <TouchableOpacity
          onPress={updateMyLocation}
          disabled={locationStatus === "capturing"}
          className={`flex-row items-center rounded-full border px-3 py-1.5 ${
            myLocation ? "border-green-200 bg-green-50" : "border-amber-200 bg-amber-50"
          }`}
          style={{ gap: 6, opacity: locationStatus === "capturing" ? 0.5 : 1 }}
        >
          <View className={`h-2 w-2 rounded-full ${myLocation ? "bg-green-500" : "bg-amber-500"}`} />
          <Text className={`text-sm font-medium ${myLocation ? "text-green-700" : "text-amber-700"}`}>
            {locationStatus === "capturing" ? "Locating..." : myLocation ? "Location set — update" : "Set my location"}
          </Text>
        </TouchableOpacity>

        {available !== null && (
          <TouchableOpacity
            onPress={toggleAvailability}
            disabled={savingAvailability}
            className={`flex-row items-center rounded-full border px-3 py-1.5 ${
              available ? "border-green-200 bg-green-50" : "border-gray-300 bg-gray-100"
            }`}
            style={{ gap: 6, opacity: savingAvailability ? 0.5 : 1 }}
          >
            <View className={`h-2 w-2 rounded-full ${available ? "bg-green-500" : "bg-gray-400"}`} />
            <Text className={`text-sm font-medium ${available ? "text-green-700" : "text-gray-600"}`}>
              {available ? "Available for new deliveries" : "Unavailable"}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {locationStatus === "error" && (
        <Text className="mt-1 text-xs text-red-600">
          Couldn't get your location — check location permissions and try again.
        </Text>
      )}
      {!myLocation && (
        <Text className="mt-1 text-xs text-amber-700">
          Set your location so the system can auto-assign you to nearby deliveries.
        </Text>
      )}

      {deliveries.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No deliveries assigned to you yet.</Text>
      ) : (
        <View className="mt-6" style={{ gap: 12 }}>
          {deliveries.map((d) => (
            <View key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <View className="flex-row items-center justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-medium text-gray-900">Delivery #{d.id.slice(0, 6)}</Text>
                  <Text className="text-xs text-gray-500">
                    Request {d.requestId.slice(0, 6)} · Donation {d.donationId.slice(0, 6)}
                  </Text>
                </View>
                <StatusBadge status={d.status} />
              </View>

              <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }}>
                {d.status === "pending_acceptance" && (
                  <>
                    <TouchableOpacity
                      disabled={actingOn === d.id}
                      onPress={() => respond(d, "accept")}
                      className="rounded bg-green-600 px-3 py-1.5"
                      style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                    >
                      <Text className="text-xs font-medium text-white">Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      disabled={actingOn === d.id}
                      onPress={() => respond(d, "reject")}
                      className="rounded bg-red-100 px-3 py-1.5"
                      style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                    >
                      <Text className="text-xs font-medium text-red-700">Reject</Text>
                    </TouchableOpacity>
                  </>
                )}
                {NEXT_STATUS[d.status] && (
                  <TouchableOpacity
                    disabled={actingOn === d.id}
                    onPress={() => advanceStatus(d)}
                    className="rounded bg-orange-600 px-3 py-1.5"
                    style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">
                      {actingOn === d.id ? "Updating..." : ACTION_LABEL[d.status]}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {d.status === "delivered" && d.confirmToken && (
                <View className="mt-4 items-center">
                  <DeliveryQrCode deliveryId={d.id} token={d.confirmToken} />
                </View>
              )}
            </View>
          ))}
        </View>
      )}

      <View className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        <Text className="text-sm font-semibold text-gray-900">Report a road closure or water condition</Text>
        <Text className="mt-1 text-xs text-gray-500">
          Seen a blocked road or rising water while out on deliveries? Report it here — an admin reviews and
          verifies it before it's shown publicly.
        </Text>

        {reportSent ? (
          <View className="mt-3 rounded border border-green-200 bg-green-50 p-3">
            <Text className="text-sm text-green-800">Report submitted — thanks.</Text>
            <TouchableOpacity onPress={() => setReportSent(false)} className="mt-1">
              <Text className="text-sm text-green-800 underline">Report another</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View className="mt-3" style={{ gap: 10 }}>
            <View className="rounded border border-gray-300">
              <Picker selectedValue={reportType} onValueChange={(v) => setReportType(v as typeof reportType)}>
                {Object.entries(REPORT_TYPE_LABEL).map(([key, label]) => (
                  <Picker.Item key={key} label={label} value={key} />
                ))}
              </Picker>
            </View>
            <TextInput
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              numberOfLines={2}
              placeholder="e.g. Main road near Kelaniya bridge flooded, impassable by car."
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              style={{ textAlignVertical: "top" }}
            />
            <View>
              {reportLocationStatus === "idle" && (
                <TouchableOpacity onPress={captureReportLocation}>
                  <Text className="text-sm text-slate-700 underline">Capture my current location</Text>
                </TouchableOpacity>
              )}
              {reportLocationStatus === "capturing" && <Text className="text-sm text-gray-500">Capturing location...</Text>}
              {reportLocationStatus === "captured" && <Text className="text-sm text-green-700">Location captured ✓</Text>}
              {reportLocationStatus === "error" && (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm text-red-600">Couldn't get your location.</Text>
                  <TouchableOpacity onPress={captureReportLocation}>
                    <Text className="text-sm text-slate-700 underline">Try again</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {reportError ? <Text className="text-xs text-red-600">{reportError}</Text> : null}
            <TouchableOpacity
              onPress={submitReport}
              disabled={!reportLocation || !reportDescription.trim() || submittingReport}
              className="items-center rounded bg-orange-600 py-2.5"
              style={{ opacity: !reportLocation || !reportDescription.trim() || submittingReport ? 0.5 : 1 }}
            >
              <Text className="text-sm font-medium text-white">
                {submittingReport ? "Submitting..." : "Submit report"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Modal visible={rejectTarget !== null} transparent animationType="fade" onRequestClose={() => setRejectTarget(null)}>
        <View className="flex-1 items-center justify-center bg-black/50 px-6">
          <View className="w-full max-w-sm rounded-xl bg-white p-5">
            <Text className="text-sm font-semibold text-gray-900">Reject delivery</Text>
            <Text className="mt-1 text-xs text-gray-500">Optional: why are you rejecting this?</Text>
            <TextInput
              value={rejectReason}
              onChangeText={setRejectReason}
              placeholder="Reason (optional)"
              multiline
              numberOfLines={3}
              className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm"
              style={{ textAlignVertical: "top" }}
            />
            <View className="mt-4 flex-row justify-end" style={{ gap: 8 }}>
              <TouchableOpacity onPress={() => setRejectTarget(null)} className="rounded px-3 py-2">
                <Text className="text-sm text-gray-600">Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={confirmReject} className="rounded bg-red-600 px-3 py-2">
                <Text className="text-sm font-medium text-white">Reject</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
