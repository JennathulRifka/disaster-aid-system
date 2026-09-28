import { useEffect, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from "react-native-maps";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api";
import { decodePolyline } from "../../lib/polyline";
import type { VolunteerTabParamList } from "../../navigation/types";

interface NavigationInfo {
  id: string;
  status: string;
  category: string;
  pickupLocation: { lat: number; lng: number } | null;
  dropoffLocation: { lat: number; lng: number } | null;
}

interface RouteSummary {
  path: { latitude: number; longitude: number }[];
  distanceMeters: number;
  durationSeconds: number;
}

const SRI_LANKA_REGION = { latitude: 7.8731, longitude: 80.7718, latitudeDelta: 3.2, longitudeDelta: 3.2 };

/**
 * Routes API (not the legacy Directions API — same reasoning as web's
 * VolunteerNavigation.tsx, see CLAUDE.md). Same cheapest field mask (no
 * per-step turn-by-turn text, which bills at a higher tier) and the same
 * real Google Maps Platform key already proven working for this exact call
 * from web — see mobile/.env's EXPO_PUBLIC_GOOGLE_MAPS_API_KEY comment.
 * react-native-maps has no polyline-decoding helper (that's part of the
 * Google Maps JS SDK web loads, not the native map view), so the result is
 * decoded by this project's own decodePolyline() instead.
 */
async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number }
): Promise<RouteSummary> {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || "",
      "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: "DRIVE",
    }),
  });

  const data = await res.json();
  const route = data.routes?.[0];
  if (!res.ok || !route) {
    throw new Error(data.error?.message || "couldntComputeRoute");
  }

  const path = decodePolyline(route.polyline.encodedPolyline);
  const durationSeconds = parseInt(String(route.duration).replace("s", ""), 10) || 0;
  return { path, distanceMeters: route.distanceMeters || 0, durationSeconds };
}

function formatDuration(seconds: number, t: (key: string, opts?: Record<string, unknown>) => string) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return t("volunteerNavigation.durationMinutes", { mins });
  return t("volunteerNavigation.durationHoursMinutes", { hours: Math.floor(mins / 60), mins: mins % 60 });
}

export function VolunteerNavigationScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavigationProp<VolunteerTabParamList>>();
  const route = useRoute<RouteProp<VolunteerTabParamList, "VolunteerNavigation">>();
  const { deliveryId } = route.params;

  const [info, setInfo] = useState<NavigationInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [routeSummary, setRouteSummary] = useState<RouteSummary | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch(`/api/deliveries/${deliveryId}/navigation-info`)
      .then(setInfo)
      .catch((err) => setError(err.message || t("volunteerNavigation.failedToLoadInfo")))
      .finally(() => setLoadingInfo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryId]);

  // Destination depends on progress, exactly like web: not picked up yet ->
  // head to the donation's pickup point; already picked up -> head to the
  // victim.
  const destination =
    info?.status === "accepted" ? info.pickupLocation : info?.status === "picked_up" ? info.dropoffLocation : null;
  const destinationLabel =
    info?.status === "accepted" ? t("volunteerNavigation.pickupDonor") : t("volunteerNavigation.dropoffVictim");

  async function captureMyLocation() {
    setLocationStatus("capturing");
    setError("");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationStatus("idle");
    } catch {
      setLocationStatus("error");
    }
  }

  useEffect(() => {
    if (!myLocation || !destination) return;
    setRouteLoading(true);
    setError("");
    computeRoute(myLocation, destination)
      .then((result) => {
        setRouteSummary(result);
        setError("");
      })
      .catch((err) => {
        setRouteSummary(null);
        setError(err.message === "couldntComputeRoute" ? t("volunteerNavigation.couldntComputeRoute") : err.message);
      })
      .finally(() => setRouteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, destination?.lat, destination?.lng]);

  const initialMapRegion = destination
    ? { latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.3, longitudeDelta: 0.3 }
    : SRI_LANKA_REGION;

  // Imperative recenter, not a continuously-bound `region` prop — a
  // controlled region fights the user's own pan/zoom the instant they touch
  // the map (the same lesson this project already learned twice for its
  // other map screens, see CLAUDE.md's MapViewController notes). Only jumps
  // when a fresh location capture actually lands, never on every render.
  const mapRef = useRef<MapView>(null);
  useEffect(() => {
    if (!myLocation) return;
    mapRef.current?.animateToRegion(
      { latitude: myLocation.lat, longitude: myLocation.lng, latitudeDelta: 0.08, longitudeDelta: 0.08 },
      400
    );
  }, [myLocation]);

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <View className="flex-row items-center justify-between">
        <Text className="text-2xl font-semibold text-gray-900">{t("volunteerNavigation.title")}</Text>
        <TouchableOpacity onPress={() => navigation.navigate("MyDeliveries")} accessibilityRole="button">
          <Text className="text-sm text-slate-700">{t("volunteerNavigation.backToDeliveries")}</Text>
        </TouchableOpacity>
      </View>

      {loadingInfo ? (
        <Text className="mt-4 text-sm text-gray-500">{t("common.loading")}</Text>
      ) : !info ? (
        <Text className="mt-4 text-sm text-red-600">{error || t("volunteerNavigation.deliveryNotFound")}</Text>
      ) : !destination ? (
        <Text className="mt-4 text-sm text-gray-500">
          {t("volunteerNavigation.noNavigationNeeded", { status: info.status })}
        </Text>
      ) : (
        <View className="mt-4 flex-1" style={{ gap: 12 }}>
          <View className="rounded-xl border border-gray-200 bg-white p-4">
            <Text className="text-sm text-gray-700">
              {t("volunteerNavigation.headingTo")} <Text className="font-medium text-gray-900">{destinationLabel}</Text> ·{" "}
              {t(`categories.${info.category}`, { defaultValue: info.category })}
            </Text>
            <View className="mt-3">
              <TouchableOpacity
                onPress={captureMyLocation}
                disabled={locationStatus === "capturing"}
                accessibilityRole="button"
                className={`self-start rounded px-4 py-2 ${myLocation ? "border border-gray-300" : "bg-orange-600"}`}
                style={{ opacity: locationStatus === "capturing" ? 0.5 : 1 }}
              >
                <Text className={`text-sm font-medium ${myLocation ? "text-gray-700" : "text-white"}`}>
                  {locationStatus === "capturing"
                    ? t("volunteerNavigation.locating")
                    : myLocation
                    ? t("volunteerNavigation.refreshLocation")
                    : t("volunteerNavigation.startNavigation")}
                </Text>
              </TouchableOpacity>
              {locationStatus === "error" && (
                <Text className="mt-1 text-xs text-red-600">{t("volunteerNavigation.locationErrorPermissions")}</Text>
              )}
              {routeLoading && <Text className="mt-1 text-xs text-gray-500">{t("volunteerNavigation.computingRoute")}</Text>}
              {error && <Text className="mt-1 text-xs text-red-600">{error}</Text>}
              {routeSummary && (
                <Text className="mt-2 text-sm text-gray-600">
                  {(routeSummary.distanceMeters / 1000).toFixed(1)} km · {formatDuration(routeSummary.durationSeconds, t)}
                </Text>
              )}
            </View>
          </View>

          <View className="flex-1" style={{ borderRadius: 12, overflow: "hidden" }}>
            <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={initialMapRegion}>
              {myLocation && (
                <Marker
                  coordinate={{ latitude: myLocation.lat, longitude: myLocation.lng }}
                  title="You"
                  pinColor="#2563eb"
                />
              )}
              <Marker
                coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                title={destinationLabel}
                pinColor="#ea580c"
              />
              {routeSummary && <Polyline coordinates={routeSummary.path} strokeColor="#ea580c" strokeWidth={4} />}
            </MapView>
          </View>
        </View>
      )}
    </View>
  );
}
