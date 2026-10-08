import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  RotateCw,
  Undo2,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { NavigationMap } from "@/components/NavigationMap";
import { apiFetch } from "@/lib/api";
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
} from "@/lib/navigation";

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

function formatDuration(seconds: number, t: TFunction) {
  const mins = Math.max(1, Math.round(seconds / 60));
  if (mins < 60) return t("volunteerNavigation.durationMinutes", { mins });
  return t("volunteerNavigation.durationHoursMinutes", { hours: Math.floor(mins / 60), mins: mins % 60 });
}

function formatDistance(meters: number) {
  return meters < 1000 ? `${Math.max(10, Math.round(meters / 10) * 10)} m` : `${(meters / 1000).toFixed(1)} km`;
}

/** OSRM gives structured maneuvers, not text — compose the instruction here so it can be translated. */
function instructionText(step: RouteStep, t: TFunction): string {
  const dir = step.modifier ? t(`volunteerNavigation.dir.${step.modifier.replace(" ", "_")}`, step.modifier) : "";
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

function maneuverIcon(step: RouteStep): LucideIcon {
  if (step.type === "arrive") return Flag;
  if (step.type === "roundabout" || step.type === "rotary") return RotateCw;
  switch (step.modifier) {
    case "left":
      return ArrowLeft;
    case "right":
      return ArrowRight;
    case "slight left":
      return ArrowUpLeft;
    case "slight right":
      return ArrowUpRight;
    case "sharp left":
      return CornerUpLeft;
    case "sharp right":
      return CornerUpRight;
    case "uturn":
      return Undo2;
    default:
      return ArrowUp;
  }
}

export default function VolunteerNavigation() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();

  const [info, setInfo] = useState<NavigationInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [myLocation, setMyLocation] = useState<LatLng | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [tracking, setTracking] = useState(false);
  const [locationError, setLocationError] = useState(false);
  const [route, setRoute] = useState<OsrmRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [stepIndex, setStepIndex] = useState(1);
  const [pathIndex, setPathIndex] = useState(0);
  const [rerouted, setRerouted] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [mapFailed, setMapFailed] = useState(false);
  const [error, setError] = useState("");

  const lastRouteAt = useRef(0);
  const fetching = useRef(false);
  const prevPos = useRef<LatLng | null>(null);
  const pathIndexRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    apiFetch(`/api/deliveries/${id}/navigation-info`)
      .then(setInfo)
      .catch((err) => setError(err.message || t("volunteerNavigation.failedToLoadInfo")))
      .finally(() => setLoadingInfo(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Destination depends on progress: haven't picked up yet -> head to the
  // donation's pickup point; already picked up -> head to the victim.
  const destination =
    info?.status === "accepted" ? info.pickupLocation : info?.status === "picked_up" ? info.dropoffLocation : null;
  const destinationLabel =
    info?.status === "accepted" ? t("volunteerNavigation.pickupDonor") : t("volunteerNavigation.dropoffVictim");

  // Live position: watchPosition streams updates for as long as tracking is on.
  // Heading comes from the device when it reports one (moving), otherwise it is
  // derived from the last two positions.
  useEffect(() => {
    if (!tracking) return;
    if (!navigator.geolocation) {
      setLocationError(true);
      setTracking(false);
      return;
    }
    setLocationError(false);
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const deviceHeading = pos.coords.heading;
        if (deviceHeading !== null && Number.isFinite(deviceHeading) && (pos.coords.speed ?? 0) > 1) {
          setHeading(deviceHeading);
        } else if (prevPos.current && haversineMeters(prevPos.current, here) >= MIN_HEADING_MOVE_METERS) {
          setHeading(bearingDegrees(prevPos.current, here));
        }
        if (!prevPos.current || haversineMeters(prevPos.current, here) >= MIN_HEADING_MOVE_METERS) {
          prevPos.current = here;
        }
        setMyLocation(here);
      },
      () => {
        setLocationError(true);
        setTracking(false);
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [tracking]);

  const requestRoute = useCallback(
    async (from: LatLng, to: LatLng, isReroute: boolean) => {
      fetching.current = true;
      lastRouteAt.current = Date.now();
      setRouteLoading(true);
      try {
        const result = await fetchOsrmRoute(from, to);
        setRoute(result);
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
    if (!route) {
      requestRoute(myLocation, destination, false);
      return;
    }
    const offRoute = distanceToPathMeters(myLocation, route.path) > OFF_ROUTE_METERS;
    if (offRoute && Date.now() - lastRouteAt.current > REROUTE_COOLDOWN_MS) {
      requestRoute(myLocation, destination, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocation, route, destination?.lat, destination?.lng]);

  // Destination changed (e.g. status moved from accepted to picked_up): route afresh.
  useEffect(() => {
    setRoute(null);
  }, [destination?.lat, destination?.lng]);

  // Advance through the maneuvers and along the route as the volunteer moves.
  useEffect(() => {
    if (!myLocation || !route) return;
    const idx = nearestPathIndex(myLocation, route.path, pathIndexRef.current);
    pathIndexRef.current = idx;
    setPathIndex(idx);
    setStepIndex((cur) => advanceStep(idx, route.stepPathIndex, cur));
  }, [myLocation, route]);

  const currentStep = route?.steps[stepIndex];
  const distanceToStep = myLocation && currentStep ? haversineMeters(myLocation, currentStep.location) : null;
  const arrived = !!myLocation && !!destination && haversineMeters(myLocation, destination) < ARRIVED_METERS;

  const remainingPath = useMemo<[number, number][]>(() => {
    if (!route) return [];
    const rest = route.path.slice(pathIndex);
    return myLocation && tracking ? [[myLocation.lat, myLocation.lng], ...rest] : rest;
  }, [route, pathIndex, myLocation, tracking]);

  const remainingMeters = route ? remainingPathMeters(route.path, pathIndex) : 0;
  const remainingSeconds = route && route.distanceMeters > 0 ? route.durationSeconds * (remainingMeters / route.distanceMeters) : 0;
  const eta = new Date(Date.now() + remainingSeconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const spoken = useRef("");
  useEffect(() => {
    if (!voiceOn || !currentStep || arrived || !("speechSynthesis" in window)) return;
    const text = instructionText(currentStep, t);
    if (spoken.current === `${stepIndex}:${text}`) return;
    spoken.current = `${stepIndex}:${text}`;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = i18n.language;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  }, [voiceOn, currentStep, stepIndex, arrived, i18n.language, t]);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const driving = tracking;
  const StepIcon = currentStep ? maneuverIcon(currentStep) : ArrowUp;

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t("volunteerNavigation.title")}</h1>
        <Link to="/deliveries/mine" className="text-sm text-slate-700 hover:underline">
          {t("volunteerNavigation.backToDeliveries")}
        </Link>
      </div>

      {loadingInfo ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : !info ? (
        <p className="mt-4 text-sm text-red-600">{error || t("volunteerNavigation.deliveryNotFound")}</p>
      ) : !destination ? (
        <p className="mt-4 text-sm text-gray-500">
          {t("volunteerNavigation.noNavigationNeeded", { status: info.status })}
        </p>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-sm text-gray-700">
              {t("volunteerNavigation.headingTo")}{" "}
              <span className="font-medium text-gray-900">{destinationLabel}</span> ·{" "}
              {t(`categories.${info.category}`, info.category)}
            </p>
            <div className="mt-3">
              <button
                onClick={() => setTracking(true)}
                className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
              >
                {t("volunteerNavigation.startNavigation")}
              </button>
            </div>
            {locationError && (
              <p className="mt-2 text-xs text-red-600">{t("volunteerNavigation.locationErrorPermissions")}</p>
            )}
            {routeLoading && !driving && (
              <p className="mt-2 text-xs text-gray-500">{t("volunteerNavigation.computingRoute")}</p>
            )}
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            {route && !driving && (
              <p className="mt-3 text-sm text-gray-600">
                {(route.distanceMeters / 1000).toFixed(1)} km · {formatDuration(route.durationSeconds, t)}
              </p>
            )}
          </div>

          {mapFailed ? (
            <p className="text-sm text-red-600">{t("volunteerNavigation.mapFailed")}</p>
          ) : (
            // One map instance for both states: a card in the page, or full screen while driving.
            <div
              className={
                driving
                  ? "fixed inset-0 z-[1300] bg-white"
                  : "relative h-[420px] overflow-hidden rounded-xl border border-gray-200"
              }
            >
              <NavigationMap
                remainingPath={remainingPath}
                fullPath={route?.path ?? null}
                position={myLocation}
                heading={heading}
                destination={destination}
                driving={driving}
                onError={() => setMapFailed(true)}
              />

              {driving && (
                <>
                  <div className="pointer-events-none absolute inset-x-0 top-0 p-3">
                    <div
                      className="pointer-events-auto mx-auto flex max-w-xl items-center gap-4 rounded-2xl bg-slate-900 px-4 py-3 text-white shadow-lg"
                      role="status"
                      aria-live="polite"
                    >
                      {arrived ? (
                        <>
                          <Flag size={36} className="shrink-0 text-green-400" />
                          <p className="text-lg font-semibold">
                            {t("volunteerNavigation.arrivedAt", { place: destinationLabel })}
                          </p>
                        </>
                      ) : currentStep ? (
                        <>
                          <StepIcon size={40} strokeWidth={2.5} className="shrink-0" />
                          <div className="min-w-0">
                            <p className="text-xl font-semibold leading-tight">{instructionText(currentStep, t)}</p>
                            {distanceToStep !== null && (
                              <p className="mt-0.5 text-sm text-slate-300">
                                {t("volunteerNavigation.inDistance", { distance: formatDistance(distanceToStep) })}
                              </p>
                            )}
                          </div>
                        </>
                      ) : (
                        <p className="text-base">
                          {myLocation ? t("volunteerNavigation.computingRoute") : t("volunteerNavigation.locating")}
                        </p>
                      )}
                    </div>
                    {rerouted && !routeLoading && (
                      <p className="mx-auto mt-2 w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 shadow">
                        {t("volunteerNavigation.rerouted")}
                      </p>
                    )}
                    {locationError && (
                      <p className="mx-auto mt-2 w-fit rounded-full bg-red-100 px-3 py-1 text-xs font-medium text-red-700 shadow">
                        {t("volunteerNavigation.locationErrorPermissions")}
                      </p>
                    )}
                  </div>

                  <div className="absolute inset-x-0 bottom-0 p-3">
                    <div className="mx-auto flex max-w-xl items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 shadow-lg">
                      <div>
                        <p className="text-xl font-semibold text-gray-900">
                          {route ? formatDuration(remainingSeconds, t) : "—"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {route ? `${formatDistance(remainingMeters)} · ${t("volunteerNavigation.eta", { time: eta })}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setVoiceOn((on) => !on)}
                          aria-pressed={voiceOn}
                          aria-label={voiceOn ? t("volunteerNavigation.voiceOn") : t("volunteerNavigation.voiceOff")}
                          className={`rounded-full border p-3 ${
                            voiceOn ? "border-orange-300 bg-orange-50 text-orange-700" : "border-gray-300 text-gray-600"
                          }`}
                        >
                          {voiceOn ? <Volume2 size={20} /> : <VolumeX size={20} />}
                        </button>
                        <button
                          onClick={() => setTracking(false)}
                          className="flex items-center gap-1.5 rounded-full bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          <X size={18} />
                          {t("volunteerNavigation.stopNavigation")}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
