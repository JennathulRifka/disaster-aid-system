import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { GoogleMap, Polyline, MarkerF, useJsApiLoader } from "@react-google-maps/api";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface NavigationInfo {
  id: string;
  status: string;
  category: string;
  pickupLocation: { lat: number; lng: number } | null;
  dropoffLocation: { lat: number; lng: number } | null;
}

interface RouteSummary {
  path: google.maps.LatLng[];
  distanceMeters: number;
  durationSeconds: number;
}

const MAP_CONTAINER_STYLE = { width: "100%", height: "420px" };
const SRI_LANKA_CENTER = { lat: 7.8731, lng: 80.7718 };
// Stable reference — @react-google-maps/api reloads the script if this array
// is a new object every render. `geometry` is needed client-side only to
// decode Routes API's encoded polyline into drawable points.
const GOOGLE_MAPS_LIBRARIES: "geometry"[] = ["geometry"];

/**
 * Routes API (not the legacy Directions API — see CLAUDE.md for why).
 * Deliberately requests only the cheapest ("Essentials" tier) fields —
 * polyline + distance + duration, no per-step turn-by-turn instructions,
 * which bills at a higher tier. https://routes.googleapis.com pricing.
 */
async function computeRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  t: TFunction
): Promise<RouteSummary> {
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
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
    throw new Error(data.error?.message || t("volunteerNavigation.couldntComputeRoute"));
  }

  const path = google.maps.geometry.encoding.decodePath(route.polyline.encodedPolyline);
  const durationSeconds = parseInt(String(route.duration).replace("s", ""), 10) || 0;
  return { path, distanceMeters: route.distanceMeters || 0, durationSeconds };
}

function formatDuration(seconds: number, t: TFunction) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return t("volunteerNavigation.durationMinutes", { mins });
  return t("volunteerNavigation.durationHoursMinutes", { hours: Math.floor(mins / 60), mins: mins % 60 });
}

export default function VolunteerNavigation() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries: GOOGLE_MAPS_LIBRARIES,
  });

  const [info, setInfo] = useState<NavigationInfo | null>(null);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [route, setRoute] = useState<RouteSummary | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [error, setError] = useState("");
  const [loadingInfo, setLoadingInfo] = useState(true);

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

  function captureMyLocation() {
    setLocationStatus("capturing");
    setError("");
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("idle");
      },
      () => setLocationStatus("error")
    );
  }

  useEffect(() => {
    if (!isLoaded || !myLocation || !destination) return;
    setRouteLoading(true);
    setError("");
    computeRoute(myLocation, destination, t)
      .then((result) => {
        setRoute(result);
        setError("");
      })
      .catch((err) => {
        setRoute(null);
        setError(err.message || t("volunteerNavigation.couldntComputeRoute"));
      })
      .finally(() => setRouteLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, myLocation, destination?.lat, destination?.lng]);

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
              {myLocation ? (
                <button
                  onClick={captureMyLocation}
                  disabled={locationStatus === "capturing"}
                  className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {locationStatus === "capturing"
                    ? t("volunteerNavigation.locating")
                    : t("volunteerNavigation.refreshLocation")}
                </button>
              ) : (
                <button
                  onClick={captureMyLocation}
                  disabled={locationStatus === "capturing"}
                  className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                >
                  {locationStatus === "capturing"
                    ? t("volunteerNavigation.locating")
                    : t("volunteerNavigation.startNavigation")}
                </button>
              )}
              {locationStatus === "error" && (
                <p className="mt-1 text-xs text-red-600">{t("volunteerNavigation.locationErrorPermissions")}</p>
              )}
              {routeLoading && <p className="mt-1 text-xs text-gray-500">{t("volunteerNavigation.computingRoute")}</p>}
              {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
              {route && (
                <p className="mt-2 text-sm text-gray-600">
                  {(route.distanceMeters / 1000).toFixed(1)} km · {formatDuration(route.durationSeconds, t)}
                </p>
              )}
            </div>
          </div>

          {loadError ? (
            <p className="text-sm text-red-600">{t("volunteerNavigation.loadFailedGoogleMaps")}</p>
          ) : !isLoaded ? (
            <p className="text-sm text-gray-500">{t("volunteerNavigation.loadingMap")}</p>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <GoogleMap
                mapContainerStyle={MAP_CONTAINER_STYLE}
                center={myLocation || destination || SRI_LANKA_CENTER}
                zoom={myLocation ? 13 : 8}
              >
                {myLocation && <MarkerF position={myLocation} label="You" />}
                <MarkerF position={destination} label={info.status === "accepted" ? "P" : "D"} />
                {route && (
                  <Polyline path={route.path} options={{ strokeColor: "#ea580c", strokeWeight: 4 }} />
                )}
              </GoogleMap>
            </div>
          )}
        </div>
      )}
    </DashboardLayout>
  );
}
