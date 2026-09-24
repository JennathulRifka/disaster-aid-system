import { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  AccessibilityInfo,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
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

// Persisted so the button stays wherever the user last dropped it, across
// app restarts — not just for the current session.
const POSITION_STORAGE_KEY = "sos_button_position";
const BUTTON_WIDTH = 108;
const BUTTON_HEIGHT = 48;
const EDGE_MARGIN = 8;
// Below this total movement, a press-and-release is treated as a tap (opens
// the modal) rather than a drag — without this, the button could never be
// tapped at all once PanResponder owns the touch.
const TAP_DISTANCE_THRESHOLD = 6;

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

  // --- Draggable positioning ---
  const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
  const defaultPosition = useRef({
    x: screenWidth - BUTTON_WIDTH - 20,
    y: screenHeight - 90 - BUTTON_HEIGHT,
  }).current;
  const pan = useRef(new Animated.ValueXY(defaultPosition)).current;
  // Animated.ValueXY has no synchronous public getter, so the current
  // (settled) position is tracked separately for clamping/persisting math.
  const positionRef = useRef(defaultPosition);
  const dragDistanceRef = useRef(0);
  const [positionReady, setPositionReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(POSITION_STORAGE_KEY)
      .then((saved) => {
        if (saved) {
          const parsed = JSON.parse(saved);
          if (typeof parsed?.x === "number" && typeof parsed?.y === "number") {
            positionRef.current = parsed;
            pan.setValue(parsed);
          }
        }
      })
      .catch(() => {
        // Corrupt/missing saved position — fall back to the default silently.
      })
      .finally(() => setPositionReady(true));
  }, []);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragDistanceRef.current = 0;
        pan.setOffset(positionRef.current);
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: (event, gesture) => {
        dragDistanceRef.current = Math.abs(gesture.dx) + Math.abs(gesture.dy);
        Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false })(event, gesture);
      },
      onPanResponderRelease: (_, gesture) => {
        pan.flattenOffset();
        const raw = { x: positionRef.current.x + gesture.dx, y: positionRef.current.y + gesture.dy };
        const clamped = {
          x: Math.max(EDGE_MARGIN, Math.min(raw.x, screenWidth - BUTTON_WIDTH - EDGE_MARGIN)),
          y: Math.max(EDGE_MARGIN, Math.min(raw.y, screenHeight - BUTTON_HEIGHT - EDGE_MARGIN)),
        };
        pan.setValue(clamped);
        positionRef.current = clamped;
        AsyncStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(clamped)).catch(() => {});

        if (dragDistanceRef.current < TAP_DISTANCE_THRESHOLD) {
          setOpen(true);
        }
      },
    })
  ).current;

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

  // Screen readers get no equivalent of a color change or a re-rendered
  // sentence unless something explicitly announces it — this is the RN
  // cross-platform stand-in for web's aria-live regions (see
  // AccessibilityInfo docs; there's no declarative prop that works on both
  // iOS and Android, so this has to be called imperatively on change).
  useEffect(() => {
    if (locationStatus === "captured") AccessibilityInfo.announceForAccessibility("Location captured");
    if (locationStatus === "error") AccessibilityInfo.announceForAccessibility("Couldn't get your location");
  }, [locationStatus]);

  useEffect(() => {
    if (sent) AccessibilityInfo.announceForAccessibility("SOS sent. Help is on the way.");
  }, [sent]);

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
      {positionReady && (
        <Animated.View
          {...panResponder.panHandlers}
          // Plain Views with pan handlers register no accessibility node at
          // all by default — without `accessible`, TalkBack/VoiceOver can't
          // discover this as a tappable element, which on the single most
          // safety-critical control in the app would mean a screen-reader
          // user simply can't find or activate it. Free-form dragging still
          // isn't screen-reader-operable (an inherent limitation of gesture
          // handlers, not fixable here), but TalkBack/VoiceOver's own
          // focus-then-double-tap activation still lands as a near-zero-
          // distance touch, which the existing tap-vs-drag threshold below
          // already treats as a tap — so activation works even though
          // dragging doesn't.
          accessible
          accessibilityRole="button"
          accessibilityLabel="Send SOS emergency alert"
          accessibilityHint="Opens the emergency report form. Can also be dragged to reposition this button."
          style={[pan.getLayout(), { position: "absolute", zIndex: 50 }]}
        >
          <View
            className="flex-row items-center rounded-full bg-red-600 px-5 py-3 shadow-lg"
            style={{ gap: 6, elevation: 6 }}
          >
            <Text className="text-sm font-bold text-white" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              🆘 SOS
            </Text>
          </View>
        </Animated.View>
      )}

      <Modal visible={open} transparent animationType="fade" onRequestClose={handleClose}>
        <View
          className="flex-1 items-center justify-center bg-black/50 px-4"
          accessibilityViewIsModal
        >
          <View className="w-full max-w-sm rounded-xl bg-white p-5">
            {sent ? (
              <View className="items-center">
                <Text className="text-3xl" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  ✅
                </Text>
                <Text className="mt-2 text-base font-semibold text-gray-900">Help is on the way</Text>
                <Text className="mt-1 text-center text-sm text-gray-600">
                  An admin has been notified and will respond shortly.
                </Text>
                <TouchableOpacity onPress={handleClose} className="mt-4 w-full rounded bg-gray-100 py-2.5" accessibilityRole="button">
                  <Text className="text-center text-sm font-medium text-gray-700">Close</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View className="mb-3 flex-row items-center justify-between">
                  <Text className="text-base font-bold text-red-700">
                    <Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants">🆘 </Text>
                    Emergency SOS
                  </Text>
                  <TouchableOpacity onPress={handleClose} accessibilityRole="button">
                    <Text className="text-sm text-gray-500">Close</Text>
                  </TouchableOpacity>
                </View>

                <Text className="mb-3 text-xs text-gray-500">
                  For life-safety emergencies only. This alerts admins immediately.
                </Text>

                <View className="flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="radiogroup">
                  {SOS_TYPES.map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      onPress={() => setType(key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: type === key, checked: type === key }}
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
                      <TouchableOpacity onPress={captureLocation} accessibilityRole="button">
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
                  accessibilityLabel="Number of people (optional)"
                  className="mt-3 rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  multiline
                  numberOfLines={2}
                  placeholder="Brief description (optional)"
                  accessibilityLabel="Brief description (optional)"
                  className="mt-2 rounded border border-gray-300 px-3 py-2 text-sm"
                  style={{ textAlignVertical: "top" }}
                />

                {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}

                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={!type || !location || submitting}
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !type || !location || submitting }}
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
