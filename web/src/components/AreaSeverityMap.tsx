import { Fragment, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, GeoJSON, Polygon, Popup, useMap } from "react-leaflet";
import type { Feature, FeatureCollection } from "geojson";
import type { Layer, PathOptions } from "leaflet";
import { useTranslation } from "react-i18next";
import "@/lib/leafletIcons";
import { apiFetch } from "@/lib/api";

interface AreaStat {
  district: string;
  lat: number;
  lng: number;
  requestCount: number;
  avgSeverity: number;
  level: "low" | "moderate" | "high";
}

interface DistrictBoundaryProps {
  district: string;
  districtSi: string;
  districtTa: string;
  province: string;
  pcode: string;
  areaSqKm: number;
}

interface GaugeStation {
  station: string;
  basin: string;
  lat: number;
  lng: number;
  waterLevel: number | null;
  alertLevel: number | null;
  minorFloodLevel: number | null;
  majorFloodLevel: number | null;
  status: "normal" | "alert" | "minor_flood" | "major_flood";
}

interface GdacsEvent {
  eventId: number | null;
  eventType: string | null;
  eventName: string | null;
  alertLevel: string | null;
  title: string;
  severityText: string | null;
  fromDate: string | null;
  toDate: string | null;
  location: { lat: number; lng: number } | null;
  geometry: [number, number][] | null;
}

interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depthKm: number | null;
  tsunami: boolean;
  lat: number;
  lng: number;
}

interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  lat?: number | null;
  lng?: number | null;
  locationApproximate?: boolean;
  district?: string | null;
  date?: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
  riskLevel: "normal" | "elevated" | "high" | "spilling";
}

const LEVEL_COLOR: Record<string, string> = {
  high: "#dc2626",
  moderate: "#f59e0b",
  low: "#16a34a",
  none: "#9ca3af",
};

const GAUGE_STATUS_COLOR: Record<string, string> = {
  major_flood: "#dc2626",
  minor_flood: "#f97316",
  alert: "#f59e0b",
  normal: "#2563eb",
};

// Same hex values already used for GDACS on SituationMap.tsx, re-keyed by
// their own Green/Orange/Red alert level.
const GDACS_ALERT_COLOR: Record<string, string> = {
  Green: "#16a34a",
  Orange: "#f97316",
  Red: "#dc2626",
};

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "#dc2626";
  if (mag >= 5) return "#f59e0b";
  return "#6b7280";
}

// Same hue progression as GAUGE_STATUS_COLOR — reservoir risk (storage %) is
// a different metric from gauge flow status, but the same gradient reads
// consistently on the same map. Used only for Kotmale/Victoria/Randenigala
// (the 3 CEB reservoirs with real coordinates) — see RESERVOIR_APPROX_COLOR
// just below for the other 109, which don't have any.
const RESERVOIR_RISK_COLOR: Record<string, string> = {
  normal: "#2563eb",
  elevated: "#f59e0b",
  high: "#f97316",
  spilling: "#dc2626",
};

// The 109 Irrigation Dept reservoirs have no coordinates at all — only a
// district name — so they're plotted at their district's centroid instead.
// A single light-pink color, deliberately not risk-graduated like the CEB
// markers, signals "approximate district-level position, check the popup
// for the real risk level." Reservoirs sharing a district stack on the same
// point — an honest reflection of the source data's limits, not a bug.
const RESERVOIR_APPROX_COLOR = "#f9a8d4";

const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];
const REGIONAL_CENTER: [number, number] = [8, 87]; // zooms out to include the Sumatra subduction zone, for the earthquakes layer

type ViewMode = "areas" | "gauges" | "reservoirs" | "gdacs" | "earthquakes";

// react-leaflet's MapContainer only applies center/zoom on first mount —
// this recenters the existing map instance when switching to the
// earthquakes layer in "regional" scope (whose events are hundreds of km
// outside the normal Sri-Lanka-only view, which the "sri-lanka" scope's own
// bounding box roughly matches already), same pattern as SituationMap.tsx's
// admin map.
function MapViewController({ viewMode, earthquakeScope }: { viewMode: ViewMode; earthquakeScope: "sri-lanka" | "regional" }) {
  const map = useMap();
  useEffect(() => {
    const regional = viewMode === "earthquakes" && earthquakeScope === "regional";
    map.setView(regional ? REGIONAL_CENTER : SRI_LANKA_CENTER, regional ? 5 : 7);
  }, [viewMode, earthquakeScope, map]);
  return null;
}

// Public data only: district-aggregated request density, and river-gauge
// readings (public infrastructure monitoring, not personal data) — never a
// per-victim pin. Shared between the landing page (embedded preview) and
// /severity-map (full page). `extraLayers` additionally enables the GDACS
// and earthquake map layers — on for both the landing page and /severity-map,
// so the public gets the same four tabs admin's Situation Map has (off by
// default only for a caller that doesn't pass the prop at all).
export function AreaSeverityMap({
  height = "600px",
  showPopups = true,
  showToggle = true,
  extraLayers = false,
}: {
  height?: string;
  showPopups?: boolean;
  showToggle?: boolean;
  extraLayers?: boolean;
}) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("areas");
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [gauges, setGauges] = useState<GaugeStation[]>([]);
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [reservoirsLoaded, setReservoirsLoaded] = useState(false);
  const [gdacsEvents, setGdacsEvents] = useState<GdacsEvent[]>([]);
  const [gdacsScope, setGdacsScope] = useState<"sri-lanka" | "global">("sri-lanka");
  const [gdacsFetching, setGdacsFetching] = useState(false);
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [earthquakeScope, setEarthquakeScope] = useState<"sri-lanka" | "regional">("sri-lanka");
  const [earthquakesFetching, setEarthquakesFetching] = useState(false);
  const [boundaries, setBoundaries] = useState<FeatureCollection<any, DistrictBoundaryProps> | null>(null);
  const [loading, setLoading] = useState(true);
  const [gaugesLoaded, setGaugesLoaded] = useState(false);
  const [gdacsLoaded, setGdacsLoaded] = useState(false);
  const [earthquakesLoaded, setEarthquakesLoaded] = useState(false);

  const LEVEL_LABEL: Record<string, string> = {
    high: t("severityMap.highNeed"),
    moderate: t("severityMap.moderateNeed"),
    low: t("severityMap.lowNeed"),
    none: t("severityMap.noActivity"),
  };

  const GAUGE_STATUS_LABEL: Record<string, string> = {
    major_flood: t("severityMap.majorFlood"),
    minor_flood: t("severityMap.minorFlood"),
    alert: t("severityMap.alertLevel"),
    normal: t("severityMap.normal"),
  };

  const RESERVOIR_RISK_LABEL: Record<string, string> = {
    normal: t("severityMap.reservoirRiskNormal"),
    elevated: t("severityMap.reservoirRiskElevated"),
    high: t("severityMap.reservoirRiskHigh"),
    spilling: t("severityMap.reservoirRiskSpilling"),
  };

  useEffect(() => {
    apiFetch("/api/stats/by-area")
      .then(setAreas)
      .finally(() => setLoading(false));
  }, []);

  // Fetched separately and never blocks the map's initial render — the first
  // request after a cache expiry can take a while server-side (it's a ~130MB
  // download simplified down server-side, see external.js), so this quietly
  // falls back to the existing centroid-circle rendering below until (or
  // unless) it resolves, rather than making the whole page wait on it.
  useEffect(() => {
    apiFetch("/api/external/district-boundaries")
      .then((data) => setBoundaries(data))
      .catch(() => setBoundaries(null));
  }, []);

  useEffect(() => {
    if (viewMode === "gauges" && !gaugesLoaded) {
      apiFetch("/api/external/water-levels").then((data) => {
        setGauges(data);
        setGaugesLoaded(true);
      });
    }
  }, [viewMode, gaugesLoaded]);

  useEffect(() => {
    if (viewMode === "reservoirs" && !reservoirsLoaded) {
      apiFetch("/api/external/reservoirs").then((data) => {
        setReservoirs(data);
        setReservoirsLoaded(true);
      });
    }
  }, [viewMode, reservoirsLoaded]);

  useEffect(() => {
    // Defaults to Sri-Lanka-relevant (usually empty) with a "view global
    // events" fallback — same pattern as the earthquake scope toggle just
    // below, and the admin map's own GDACS scope toggle. Refetches whenever
    // the scope is switched, not just once per tab-open.
    if (viewMode !== "gdacs") return;
    setGdacsFetching(true);
    apiFetch(`/api/external/gdacs?scope=${gdacsScope}`)
      .then((data) => {
        setGdacsEvents(data);
        setGdacsLoaded(true);
      })
      .finally(() => setGdacsFetching(false));
  }, [viewMode, gdacsScope]);

  useEffect(() => {
    // Defaults to Sri-Lanka-only (usually empty, an honest reflection of
    // real seismic activity) with a "view regional events" fallback once
    // that comes back empty — same pattern as the admin map's scope
    // toggles, now also on this shared public/landing component. Refetches
    // whenever the scope is switched, not just once per tab-open.
    if (viewMode !== "earthquakes") return;
    setEarthquakesFetching(true);
    apiFetch(`/api/external/earthquakes?scope=${earthquakeScope}`)
      .then((data) => {
        setEarthquakes(data);
        setEarthquakesLoaded(true);
      })
      .finally(() => setEarthquakesFetching(false));
  }, [viewMode, earthquakeScope]);

  if (loading) {
    return <p className="text-sm text-gray-500">{t("common.loading")}</p>;
  }

  return (
    <>
      {showToggle && (
        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setViewMode("areas")}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              viewMode === "areas" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            } border border-gray-300`}
          >
            {t("severityMap.areasAffected")}
          </button>
          <button
            onClick={() => setViewMode("gauges")}
            className={`rounded px-3 py-1.5 text-xs font-medium ${
              viewMode === "gauges" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
            } border border-gray-300`}
          >
            {t("severityMap.riverLevels")}
          </button>
          {extraLayers && (
            <>
              <button
                onClick={() => setViewMode("reservoirs")}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  viewMode === "reservoirs" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
                } border border-gray-300`}
              >
                {t("severityMap.reservoirsTabLabel")}
              </button>
              <button
                onClick={() => setViewMode("gdacs")}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  viewMode === "gdacs" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
                } border border-gray-300`}
              >
                {t("severityMap.gdacsTitle")}
              </button>
              <button
                onClick={() => setViewMode("earthquakes")}
                className={`rounded px-3 py-1.5 text-xs font-medium ${
                  viewMode === "earthquakes" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
                } border border-gray-300`}
              >
                {t("severityMap.earthquakesTitle")}
              </button>
            </>
          )}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-4 text-xs text-gray-600">
        {viewMode === "areas" &&
          Object.entries(LEVEL_LABEL).map(([level, label]) => (
            <div key={level} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: LEVEL_COLOR[level] }} />
              {label}
            </div>
          ))}
        {viewMode === "gauges" &&
          Object.entries(GAUGE_STATUS_LABEL).map(([status, label]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span
                className="inline-block h-3 w-3 rounded-full"
                style={{ backgroundColor: GAUGE_STATUS_COLOR[status] }}
              />
              {label}
            </div>
          ))}
        {viewMode === "reservoirs" && (
          <>
            {Object.entries(RESERVOIR_RISK_COLOR).map(([level, color]) => (
              <div key={`reservoir-${level}`} className="flex items-center gap-1.5">
                <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                {RESERVOIR_RISK_LABEL[level]}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: RESERVOIR_APPROX_COLOR }} />
              {t("severityMap.reservoirsApproxLegend")}
            </div>
          </>
        )}
        {viewMode === "gdacs" &&
          Object.entries(GDACS_ALERT_COLOR).map(([level, color]) => (
            <div key={`gdacs-${level}`} className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
              GDACS {level}
            </div>
          ))}
        {viewMode === "earthquakes" && (
          <>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#dc2626" }} />
              M 6.0+
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#f59e0b" }} />
              M 5.0–5.9
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "#6b7280" }} />
              M 4.0–4.9
            </div>
          </>
        )}
      </div>

      {viewMode === "gauges" && (
        <p className="mb-3 text-xs text-gray-400">{t("severityMap.unofficialData")}</p>
      )}
      {viewMode === "reservoirs" && (
        <p className="mb-3 text-xs text-gray-400">{t("severityMap.reservoirsMapCaption")}</p>
      )}
      {viewMode === "reservoirs" &&
        reservoirsLoaded &&
        reservoirs.filter((r) => r.lat != null && r.lng != null).length === 0 && (
          <p className="mb-3 text-sm text-gray-500">{t("severityMap.reservoirsMapUnavailable")}</p>
        )}
      {viewMode === "gdacs" && <p className="mb-3 text-xs text-gray-400">{t("severityMap.gdacsCaption")}</p>}
      {viewMode === "earthquakes" && (
        <p className="mb-3 text-xs text-gray-400">{t("severityMap.earthquakesCaption")}</p>
      )}
      {viewMode === "gdacs" && gdacsLoaded && !gdacsFetching && gdacsEvents.length === 0 && (
        <div className="mb-3">
          <p className="text-sm text-gray-500">
            {gdacsScope === "sri-lanka" ? t("severityMap.gdacsNoEvents") : t("severityMap.gdacsNoEventsGlobal")}
          </p>
          {gdacsScope === "sri-lanka" && (
            <button
              onClick={() => setGdacsScope("global")}
              className="mt-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700 hover:border-orange-300 hover:bg-orange-100"
            >
              {t("severityMap.viewGlobalEvents")}
            </button>
          )}
        </div>
      )}
      {viewMode === "gdacs" && gdacsEvents.length > 0 && gdacsScope === "global" && (
        <button
          onClick={() => setGdacsScope("sri-lanka")}
          className="mb-3 block text-xs text-slate-600 hover:underline"
        >
          {t("severityMap.viewSriLankaOnly")}
        </button>
      )}
      {viewMode === "earthquakes" && earthquakesLoaded && !earthquakesFetching && earthquakes.length === 0 && (
        <div className="mb-3">
          <p className="text-sm text-gray-500">
            {earthquakeScope === "sri-lanka"
              ? t("severityMap.earthquakesNoEventsSriLanka")
              : t("severityMap.earthquakesNoEvents")}
          </p>
          {earthquakeScope === "sri-lanka" && (
            <button
              onClick={() => setEarthquakeScope("regional")}
              className="mt-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700 hover:border-orange-300 hover:bg-orange-100"
            >
              {t("severityMap.viewGlobalEvents")}
            </button>
          )}
        </div>
      )}
      {viewMode === "earthquakes" && earthquakes.length > 0 && earthquakeScope === "regional" && (
        <button
          onClick={() => setEarthquakeScope("sri-lanka")}
          className="mb-3 block text-xs text-slate-600 hover:underline"
        >
          {t("severityMap.viewSriLankaOnly")}
        </button>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200" style={{ height }}>
        <MapContainer center={SRI_LANKA_CENTER} zoom={7} style={{ height: "100%", width: "100%" }}>
          <MapViewController viewMode={viewMode} earthquakeScope={earthquakeScope} />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {viewMode === "areas" && boundaries && (
            <GeoJSON
              key={`boundaries-${areas.map((a) => `${a.district}:${a.level}`).join(",")}`}
              data={boundaries}
              style={(feature?: Feature<any, DistrictBoundaryProps>): PathOptions => {
                const match = areas.find((a) => a.district === feature?.properties.district);
                const color = LEVEL_COLOR[match?.level ?? "none"];
                return { color, weight: 1.2, fillColor: color, fillOpacity: match ? 0.45 : 0.1 };
              }}
              onEachFeature={(feature: Feature<any, DistrictBoundaryProps>, layer: Layer) => {
                if (!showPopups) return;
                const match = areas.find((a) => a.district === feature.properties.district);
                const count = match?.requestCount ?? 0;
                const level = match?.level ?? "none";
                layer.bindPopup(
                  `<strong>${feature.properties.district}</strong><br/>${t("severityMap.activeRequests", {
                    count,
                  })}<br/>${LEVEL_LABEL[level]}`
                );
              }}
            />
          )}
          {viewMode === "areas" &&
            !boundaries &&
            areas.map((area) => (
              <CircleMarker
                key={area.district}
                center={[area.lat, area.lng]}
                radius={Math.min(10 + area.requestCount * 3, 40)}
                pathOptions={{
                  color: LEVEL_COLOR[area.level],
                  fillColor: LEVEL_COLOR[area.level],
                  fillOpacity: 0.5,
                }}
              >
                {showPopups && (
                  <Popup>
                    <strong>{area.district}</strong>
                    <br />
                    {t("severityMap.activeRequests", { count: area.requestCount })}
                    <br />
                    {LEVEL_LABEL[area.level]}
                  </Popup>
                )}
              </CircleMarker>
            ))}
          {viewMode === "gauges" &&
            gauges.map((g) => (
              <CircleMarker
                key={g.station}
                center={[g.lat, g.lng]}
                radius={7}
                pathOptions={{
                  color: GAUGE_STATUS_COLOR[g.status],
                  fillColor: GAUGE_STATUS_COLOR[g.status],
                  fillOpacity: 0.7,
                }}
              >
                {showPopups && (
                  <Popup>
                    <strong>{g.station}</strong> ({g.basin})
                    <br />
                    {t("severityMap.level")}: {g.waterLevel ?? "—"} m
                    <br />
                    {t("severityMap.alertLevel")} {g.alertLevel ?? "—"} · {t("severityMap.minorFlood")}{" "}
                    {g.minorFloodLevel ?? "—"} · {t("severityMap.majorFlood")} {g.majorFloodLevel ?? "—"}
                    <br />
                    {GAUGE_STATUS_LABEL[g.status]}
                  </Popup>
                )}
              </CircleMarker>
            ))}
          {viewMode === "reservoirs" &&
            reservoirs
              .filter((r) => r.lat != null && r.lng != null)
              .map((r) => {
                const color = r.locationApproximate ? RESERVOIR_APPROX_COLOR : RESERVOIR_RISK_COLOR[r.riskLevel];
                return (
                  <CircleMarker
                    key={r.name}
                    center={[r.lat as number, r.lng as number]}
                    radius={r.locationApproximate ? 6 : 8}
                    pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                  >
                    {showPopups && (
                      <Popup>
                        {r.locationApproximate ? (
                          <>
                            <strong>{r.name}</strong>
                            {r.district && <> — {r.district}</>}
                            <br />
                            {r.effectiveStoragePercent != null
                              ? t("severityMap.reservoirCapacity", { pct: r.effectiveStoragePercent })
                              : t("severityMap.reservoirCapacityUnknown")}
                            <br />
                            {RESERVOIR_RISK_LABEL[r.riskLevel]}
                            <br />
                            <em>{t("severityMap.reservoirsApproxNote")}</em>
                          </>
                        ) : (
                          <>
                            <strong>{r.name}</strong>
                            <br />
                            {r.effectiveStoragePercent != null
                              ? t("severityMap.reservoirCapacity", { pct: r.effectiveStoragePercent })
                              : t("severityMap.reservoirCapacityUnknown")}
                            {r.levelMsl != null && ` · ${r.levelMsl} m MSL`}
                            <br />
                            {RESERVOIR_RISK_LABEL[r.riskLevel]}
                          </>
                        )}
                      </Popup>
                    )}
                  </CircleMarker>
                );
              })}
          {viewMode === "gdacs" &&
            gdacsEvents.map((event) => {
              const color = GDACS_ALERT_COLOR[event.alertLevel || ""] || "#6b7280";
              return (
                <Fragment key={event.eventId}>
                  {event.geometry && (
                    <Polygon
                      positions={event.geometry}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.15, weight: 2 }}
                    />
                  )}
                  {event.location && (
                    <CircleMarker
                      center={[event.location.lat, event.location.lng]}
                      radius={8}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.8 }}
                    >
                      {showPopups && (
                        <Popup>
                          <strong>{event.eventName || event.title}</strong>
                          <br />
                          {event.severityText}
                          <br />
                          {event.fromDate ? new Date(event.fromDate).toLocaleDateString() : "—"} –{" "}
                          {event.toDate ? new Date(event.toDate).toLocaleDateString() : "—"}
                        </Popup>
                      )}
                    </CircleMarker>
                  )}
                </Fragment>
              );
            })}
          {viewMode === "earthquakes" &&
            earthquakes.map((eq) => {
              const color = magnitudeColor(eq.magnitude);
              return (
                <CircleMarker
                  key={eq.id}
                  center={[eq.lat, eq.lng]}
                  radius={5 + eq.magnitude}
                  pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                >
                  {showPopups && (
                    <Popup>
                      <strong>
                        M {eq.magnitude.toFixed(1)} — {eq.place}
                      </strong>
                      <br />
                      {new Date(eq.time).toLocaleString()}
                      {eq.depthKm != null && ` · ${eq.depthKm.toFixed(0)} km deep`}
                      {eq.tsunami && (
                        <>
                          <br />
                          <span className="font-medium text-blue-700">
                            {t("severityMap.earthquakesTsunamiFlag")}
                          </span>
                        </>
                      )}
                    </Popup>
                  )}
                </CircleMarker>
              );
            })}
        </MapContainer>
      </div>

      {viewMode === "areas" && areas.length === 0 && (
        <p className="mt-4 text-sm text-gray-500">{t("severityMap.noActiveRequests")}</p>
      )}
    </>
  );
}
