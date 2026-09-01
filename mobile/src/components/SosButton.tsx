import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, Modal, TextInput, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { apiFetch } from "../lib/api";

type SosType = "trapped" | "missing_person" | "flood_rescue" | "other";
type LocationStatus = "capturing" | "captured" | "error";

const SOS_TYPES: { key: SosType; label: string }[] = [
  { key: "trapped", label: "Trapped" },
  { key: "missing_person", label: "Missing person" },
  { key: "flood_rescue", label: "Flood rescue" },
  { key: "other", label: "Other" },
];

/**
 * Deliberately separate from the aid-request flow — a life-safety emergency
 * needs the fewest possible taps, not a multi-category form. Rendered once
 * in RootNavigator so it's reachable from every page, for every role (not
 * just "victim" — someone could be reporting on behalf of another person).
 */
export function SosButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SosType | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("capturing");
  const [peopleCount, setPeopleCount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  async function captureLocation() {
    setLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationStatus("captured");
    } catch {
      setLocationStatus("error");
    }
  }

  // Start capturing the instant the modal opens — no separate "capture
  // location" tap required, matching "every second of friction matters."
  useEffect(() => {
    if (open) captureLocation();
  }, [open]);

  function handleClose() {
    setOpen(false);
    setType(null);
    setLocation(null);
    setLocationStatus("capturing");
    setPeopleCount("");
    setDescription("");
    setError("");
    setSent(false);
  }

  async function handleSubmit() {
    if (!type || !location) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/sos", {
        method: "POST",
        body: JSON.stringify({
          type,
          location,
          peopleCount: peopleCount ? Number(peopleCount) : null,
          description: description.trim(),
        }),
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || "Failed to send SOS. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        className="absolute right-5 flex-row items-center rounded-full bg-red-600 px-5 py-3 shadow-lg"
        style={{ bottom: 90, gap: 6, elevation: 6 }}
      >
        <Text className="text-sm font-bold text-white">🆘 SOS</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <View className="flex-1 items-center justify-center bg-black/50 px-4">
          <View className="w-full max-w-sm rounded-xl bg-white p-5">
            {sent ? (
              <View className="items-center">
                <Text className="text-3xl">✅</Text>
                <Text className="mt-2 text-base font-semibold text-gray-900">Help is on the way</Text>
                <Text className="mt-1 text-center text-sm text-gray-600">
                  Your SOS has been sent. An admin has been notified and will respond as soon as possible.
                </Text>
                <TouchableOpacity onPress={handleClose} className="mt-4 w-full rounded bg-gray-100 py-2.5">
                  <Text className="text-center text-sm font-medium text-gray-700">Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-base font-bold text-red-700">🆘 Emergency SOS</Text>
                  <TouchableOpacity onPress={handleClose}>
                    <Text className="text-sm text-gray-500">Close</Text>
                  </TouchableOpacity>
                </View>

                <Text className="mb-3 text-xs text-gray-500">
                  For life-safety emergencies only. This alerts admins immediately.
                </Text>

                <View className="flex-row flex-wrap" style={{ gap: 8 }}>
                  {SOS_TYPES.map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setType(key)}
                      className={`w-[47%] rounded border px-3 py-3 ${
                        type === key ? "border-red-600 bg-red-50" : "border-gray-300"
                      }`}
                    >
                      <Text className={`text-sm font-medium ${type === key ? "text-red-700" : "text-gray-700"}`}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <View className="mt-3">
                  {locationStatus === "capturing" && <Text className="text-sm text-gray-500">Capturing location...</Text>}
                  {locationStatus === "captured" && <Text className="text-sm text-green-700">Location captured ✓</Text>}
                  {locationStatus === "error" && (
                    <View className="flex-row items-center" style={{ gap: 8 }}>
                      <Text className="text-sm text-red-600">Couldn't get your location.</Text>
                      <TouchableOpacity onPress={captureLocation}>
                        <Text className="text-sm text-slate-700 underline">Retry</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>

                <TextInput
                  keyboardType="number-pad"
                  value={peopleCount}
                  onChangeText={setPeopleCount}
                  placeholder="Number of people (optional)"
                  className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                  placeholder="Brief description (optional)"
                  className="mt-2 rounded border border-gray-300 px-3 py-2 text-sm"
                  style={{ textAlignVertical: "top" }}
                />

                {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={!type || !location || submitting}
                  className="mt-3 items-center rounded bg-red-600 py-3"
                  style={{ opacity: !type || !location || submitting ? 0.5 : 1 }}
                >
                  {submitting ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-sm font-bold text-white">Send SOS</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
