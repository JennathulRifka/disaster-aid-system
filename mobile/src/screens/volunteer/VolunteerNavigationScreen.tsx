import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { BackHandler, View, Text, TouchableOpacity } from "react-native";
import type { WebView as WebViewType, WebViewMessageEvent } from "react-native-webview";
import * as Location from "expo-location";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api";
import { NAVIGATION_MAP_HTML } from "../../lib/navigationMapHtml";
import {
  advanceStep,
  bearingDegrees,
  distanceToPathMeters,
  fetchOsrmRoute,
  haversineMeters,
  nearestPathIndex,
  remainingPathMeters,
  type LatLng,
  type OsrmRoute,
  type RouteStep,
} from "../../lib/navigation";
import type { VolunteerTabParamList } from "../../navigation/types";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

// WebView, speech and keep-awake are native modules that only exist in dev-client
// builds made after they were added. They are required lazily and defensively so
// an older build still starts (and every other screen keeps working) instead of
// crashing at app launch; this screen then just asks for an app update.
let WebView: typeof import("react-native-webview").WebView | null = null;
let Speech: typeof import("expo-speech") | null = null;
let KeepAwake: typeof import("expo-keep-awake") | null = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  WebView = null;
}
try {
  Speech = require("expo-speech");
} catch {
  Speech = null;
}
try {
  KeepAwake = require("expo-keep-awake");
} catch {
  KeepAwake = null;
}

interface NavigationInfo {
  id: string;
  status: string;
  category: string;
  pickupLocation: LatLng | null;
  dropoffLocation: LatLng | null;
}

const OFF_ROUTE_METERS = 60;
const REROUTE_COOLDOWN_MS = 10000;
const ARRIVED_METERS = 30;
const MIN_HEADING_MOVE_METERS = 4;

function formatDuration(seconds: number, t: TFn) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return t("volunteerNavigation.durationMinutes", { mins });
  return t("volunteerNavigation.durationHoursMinutes", { hours: Math.floor(mins / 60), mins: mins % 60 });
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** OSRM gives structured maneuvers, not text — compose the instruction here so it can be translated. */
function instructionText(step: RouteStep, t: TFn): string {
  const dir = step.modifier
    ? t(`volunteerNavigation.dir.${step.modifier.replace(" ", "_")}`, { defaultValue: step.modifier })
    : "";
  const onto = step.name ? ` ${t("volunteerNavigation.onto", { road: step.name })}` : "";
  switch (step.type) {
    case "arrive":
      return t("volunteerNavigation.arriveDestination");
    case "depart":
      return t("volunteerNavigation.headOut", { dir });
    case "roundabout":
    case "rotary":
      return t("volunteerNavigation.roundabout") + onto;
    case "continue":
    case "new name":
      return t("volunteerNavigation.continueStraight") + onto;
    default:
      return step.modifier === "straight"
        ? t("volunteerNavigation.continueStraight") + onto
        : t("volunteerNavigation.turn", { dir }) + onto;
  }
}

/** A single up-arrow, rotated to the turn direction, keeps this to one icon. */
function maneuver(step: RouteStep): { icon: keyof typeof Ionicons.glyphMap; rotate: number } {
  if (step.type === "arrive") return { icon: "flag", rotate: 0 };
  if (step.type === "roundabout" || step.type === "rotary") return { icon: "refresh", rotate: 0 };
  const rotate: Record<string, number> = {
    left: -90,
    right: 90,
    "slight left": -45,
    "slight right": 45,
    "sharp left": -135,
    "sharp right": 135,
    uturn: 180,
  };
  return { icon: "arrow-up", rotate: rotate[step.modifier ?? ""] ?? 0 };
}

export function VolunteerNavigationScreen() {
  const { t, i18n } = useTranslation();
  const navigation = useNavigation<NavigationProp<VolunteerTabParamList>>();
  const route = useRoute<RouteProp<VolunteerTabParamList, "VolunteerNavigation">>();
  const { deliveryId } = route.params;
  const insets = useSafeAreaInsets();

  const [info, setInfo] = useState<NavigationInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [navRoute, setNavRoute] = useState<OsrmRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [pathIndex, setPathIndex] = useState(0);
  const [rerouted, setRerouted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState("");

  const webRef = useRef<WebViewType>(null);
  const lastRouteAt = useRef(0);
  const fetching = useRef(false);
  const prevPos = useRef<LatLng | null>(null);
  const pathIndexRef = useRef(0);

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

  const driving = tracking;

  // Driving mode is full screen: hide the header and tab bar, keep the screen on.
  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: !driving, tabBarStyle: driving ? { display: "none" } : undefined });
    return () => navigation.setOptions({ headerShown: true, tabBarStyle: undefined });
  }, [navigation, driving]);

  useEffect(() => {
    if (!driving) return;
    KeepAwake?.activateKeepAwakeAsync("navigation");
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setTracking(false);
      return true;
    });
    return () => {
      KeepAwake?.deactivateKeepAwake("navigation");
      sub.remove();
    };
  }, [driving]);

  // Live position. Heading comes from the device when it reports one (moving),
  // otherwise it is derived from the last two positions.
  useEffect(() => {
    if (!tracking) return;
    let cancelled = false;
    let subscription: Location.LocationSubscription | null = null;

    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setLocationError(true);
        setTracking(false);
        return;
      }
      setLocationError(false);
      try {
        subscription = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
          (pos) => {
            const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            const deviceHeading = pos.coords.heading;
            if (deviceHeading != null && deviceHeading >= 0 && (pos.coords.speed ?? 0) > 1) {
              setHeading(deviceHeading);
            } else if (prevPos.current && haversineMeters(prevPos.current, here) >= MIN_HEADING_MOVE_METERS) {
              setHeading(bearingDegrees(prevPos.current, here));
            }
            if (!prevPos.current || haversineMeters(prevPos.current, here) >= MIN_HEADING_MOVE_METERS) {
              prevPos.current = here;
            }
            setMyLocation(here);
          }
        );
        if (cancelled) subscription.remove();
      } catch {
        setLocationError(true);
        setTracking(false);
      }
    })();

    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [tracking]);

  const requestRoute = useCallback(
    async (from: LatLng, to: LatLng, isReroute: boolean) => {
      fetching.current = true;
      lastRouteAt.current = Date.now();
      setRouteLoading(true);
      try {
        const result = await fetchOsrmRoute(from, to);
        setNavRoute(result);
        setStepIndex(result.steps.length > 1 ? 1 : 0);
        pathIndexRef.current = 0;
        setPathIndex(0);
        setRerouted(isReroute);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : t("volunteerNavigation.couldntComputeRoute"));
      } finally {
        fetching.current = false;
        setRouteLoading(false);
      }
    },
    [t]
  );

  // First route, and re-route whenever the volunteer strays off the line.
  useEffect(() => {
    if (!myLocation || !destination || fetching.current) return;
    if (!navRoute) {
      requestRoute(myLocation, destination, false);
      return;
    }
    const offRoute = distanceToPathMeters(myLocation, navRoute.path) > OFF_ROUTE_METERS;
    if (offRoute && Date.now() - lastRouteAt.current > REROUTE_COOLDOWN_MS) {
      requestRoute(myLocation, destination, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, navRoute, destination?.lat, destination?.lng]);

  // Destination changed (e.g. status moved from accepted to picked_up): route afresh.
  useEffect(() => {
    setNavRoute(null);
  }, [destination?.lat, destination?.lng]);

  // Advance through the maneuvers and along the route as the volunteer moves.
  useEffect(() => {
    if (!myLocation || !navRoute) return;
    const idx = nearestPathIndex(myLocation, navRoute.path, pathIndexRef.current);
    pathIndexRef.current = idx;
    setPathIndex(idx);
    setStepIndex((cur) => advanceStep(idx, navRoute.stepPathIndex, cur));
  }, [myLocation, navRoute]);

  const currentStep = navRoute?.steps[stepIndex];
  const distanceToStep = myLocation && currentStep ? haversineMeters(myLocation, currentStep.location) : null;
  const arrived = !!myLocation && !!destination && haversineMeters(myLocation, destination) < ARRIVED_METERS;

  const remainingMeters = navRoute ? remainingPathMeters(navRoute.path, pathIndex) : 0;
  const remainingSeconds =
    navRoute && navRoute.distanceMeters > 0 ? navRoute.durationSeconds * (remainingMeters / navRoute.distanceMeters) : 0;
  const eta = new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  // The full route goes to the map once (and again after a re-route); every
  // position update afterwards only carries a progress index.
  useEffect(() => {
    if (!mapReady) return;
    webRef.current?.injectJavaScript(`window.__setRoute(${JSON.stringify(navRoute?.path ?? [])});true;`);
  }, [mapReady, navRoute]);

  useEffect(() => {
    if (!mapReady || !destination) return;
    const state = { destination, position: myLocation, heading, driving, pathIndex };
    webRef.current?.injectJavaScript(`window.__onState(${JSON.stringify(state)});true;`);
  }, [mapReady, destination, myLocation, heading, driving, pathIndex, navRoute]);

  function onMessage(e: WebViewMessageEvent) {
    try {
      const msg = JSON.parse(e.nativeEvent.data);
      if (msg.type === "ready") setMapReady(true);
      else if (msg.type === "error") setMapFailed(true);
    } catch {
      // ignore non-JSON messages
    }
  }

  // Voice guidance: speak each new instruction once.
  const spoken = useRef("");
  useEffect(() => {
    if (!voiceOn || !currentStep || arrived) return;
    const text = instructionText(currentStep, t as TFn);
    const key = `${stepIndex}:${text}`;
    if (spoken.current === key) return;
    spoken.current = key;
    Speech?.stop();
    Speech?.speak(text, { language: i18n.language });
  }, [voiceOn, currentStep, stepIndex, arrived, i18n.language, t]);

  useEffect(() => () => void Speech?.stop(), []);

  const StepInfo = currentStep ? maneuver(currentStep) : { icon: "arrow-up" as const, rotate: 0 };
  const tt = t as TFn;

  const webView = useMemo(
    () => WebView && (
      <WebView
        ref={webRef}
        originWhitelist={["*"]}
        source={{ html: NAVIGATION_MAP_HTML, baseUrl: "https://localhost/" }}
        javaScriptEnabled
        domStorageEnabled
        mixedContentMode="always"
        overScrollMode="never"
        onMessage={onMessage}
        onError={() => setMapFailed(true)}
        onHttpError={() => undefined}
        style={{ flex: 1, backgroundColor: "#f6f3ee" }}
      />
    ),
    // The WebView must never be recreated — it would reload the whole map.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  return (
    <View className="flex-1 bg-gray-50">
      {!driving && (
        <View className="p-4" style={{ gap: 12 }}>
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-semibold text-gray-900">{t("volunteerNavigation.title")}</Text>
            <TouchableOpacity onPress={() => navigation.navigate("MyDeliveries")} accessibilityRole="button">
              <Text className="text-sm text-slate-700">{t("volunteerNavigation.backToDeliveries")}</Text>
            </TouchableOpacity>
          </View>

          {loadingInfo ? (
            <Text className="text-sm text-gray-500">{t("common.loading")}</Text>
          ) : !info ? (
            <Text className="text-sm text-red-600">{error || t("volunteerNavigation.deliveryNotFound")}</Text>
          ) : !destination ? (
            <Text className="text-sm text-gray-500">
              {t("volunteerNavigation.noNavigationNeeded", { status: info.status })}
            </Text>
          ) : (
            <View className="rounded-xl border border-gray-200 bg-white p-4">
              <Text className="text-sm text-gray-700">
                {t("volunteerNavigation.headingTo")}{" "}
                <Text className="font-medium text-gray-900">{destinationLabel}</Text> ·{" "}
                {t(`categories.${info.category}`, { defaultValue: info.category })}
              </Text>
              <TouchableOpacity
                onPress={() => setTracking(true)}
                accessibilityRole="button"
                className="mt-3 self-start rounded bg-orange-600 px-4 py-2"
              >
                <Text className="text-sm font-medium text-white">{t("volunteerNavigation.startNavigation")}</Text>
              </TouchableOpacity>
              {locationError && (
                <Text className="mt-2 text-xs text-red-600">{t("volunteerNavigation.locationErrorPermissions")}</Text>
              )}
              {routeLoading && (
                <Text className="mt-2 text-xs text-gray-500">{t("volunteerNavigation.computingRoute")}</Text>
              )}
              {error ? <Text className="mt-2 text-xs text-red-600">{error}</Text> : null}
              {navRoute && (
                <Text className="mt-3 text-sm text-gray-600">
                  {(navRoute.distanceMeters / 1000).toFixed(1)} km · {formatDuration(navRoute.durationSeconds, tt)}
                </Text>
              )}
            </View>
          )}
        </View>
      )}

      {info && destination && (
        <View className="flex-1" style={!driving ? { margin: 16, marginTop: 0, borderRadius: 12, overflow: "hidden" } : undefined}>
          {!WebView ? (
            <Text className="p-4 text-sm text-red-600">{t("volunteerNavigation.updateAppRequired")}</Text>
          ) : mapFailed ? (
            <Text className="p-4 text-sm text-red-600">{t("volunteerNavigation.mapFailed")}</Text>
          ) : (
            webView
          )}

          {driving && (
            <>
              <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, padding: 12, paddingTop: insets.top + 8 }}>
                <View
                  accessibilityLiveRegion="polite"
                  className="flex-row items-center rounded-2xl bg-slate-900 px-4 py-3"
                  style={{ gap: 14, elevation: 6 }}
                >
                  {arrived ? (
                    <>
                      <Ionicons name="flag" size={34} color="#4ade80" />
                      <Text className="flex-1 text-lg font-semibold text-white">
                        {t("volunteerNavigation.arrivedAt", { place: destinationLabel })}
                      </Text>
                    </>
                  ) : currentStep ? (
                    <>
                      <Ionicons
                        name={StepInfo.icon}
                        size={40}
                        color="#ffffff"
                        style={{ transform: [{ rotate: `${StepInfo.rotate}deg` }] }}
                      />
                      <View className="flex-1">
                        <Text className="text-xl font-semibold leading-tight text-white">
                          {instructionText(currentStep, tt)}
                        </Text>
                        {distanceToStep !== null && (
                          <Text className="mt-0.5 text-sm text-slate-300">
                            {t("volunteerNavigation.inDistance", { distance: formatDistance(distanceToStep) })}
                          </Text>
                        )}
                      </View>
                    </>
                  ) : (
                    <Text className="text-base text-white">
                      {myLocation ? t("volunteerNavigation.computingRoute") : t("volunteerNavigation.locating")}
                    </Text>
                  )}
                </View>
                {rerouted && !routeLoading && (
                  <Text className="mt-2 self-center rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800">
                    {t("volunteerNavigation.rerouted")}
                  </Text>
                )}
                {locationError && (
                  <Text className="mt-2 self-center rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                    {t("volunteerNavigation.locationErrorPermissions")}
                  </Text>
                )}
              </View>

              <View pointerEvents="box-none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: 12, paddingBottom: insets.bottom + 12 }}>
                <View className="flex-row items-center justify-between rounded-2xl bg-white px-4 py-3" style={{ elevation: 6 }}>
                  <View>
                    <Text className="text-xl font-semibold text-gray-900">
                      {navRoute ? formatDuration(remainingSeconds, tt) : "—"}
                    </Text>
                    <Text className="text-sm text-gray-500">
                      {navRoute ? `${formatDistance(remainingMeters)} · ${t("volunteerNavigation.eta", { time: eta })}` : ""}
                    </Text>
                  </View>
                  <View className="flex-row items-center" style={{ gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => setVoiceOn((on) => !on)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: voiceOn }}
                      accessibilityLabel={voiceOn ? t("volunteerNavigation.voiceOn") : t("volunteerNavigation.voiceOff")}
                      className={`rounded-full border p-3 ${voiceOn ? "border-orange-300 bg-orange-50" : "border-gray-300"}`}
                    >
                      <Ionicons
                        name={voiceOn ? "volume-high" : "volume-mute"}
                        size={20}
                        color={voiceOn ? "#c2410c" : "#4b5563"}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setTracking(false)}
                      accessibilityRole="button"
                      className="flex-row items-center rounded-full bg-red-600 px-4 py-3"
                      style={{ gap: 6 }}
                    >
                      <Ionicons name="close" size={18} color="#ffffff" />
                      <Text className="text-sm font-semibold text-white">{t("volunteerNavigation.stopNavigation")}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </>
          )}
        </View>
      )}
    </View>
  );
}
