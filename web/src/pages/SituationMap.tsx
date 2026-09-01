import { Fragment, useEffect, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Polygon, Popup, useMap } from "react-leaflet";
import "@/lib/leafletIcons";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { DISTRICTS } from "@/lib/districts";

interface AidRequest {
  id: string;
  victimName: string;
  disasterType: string;
  severity: string;
  status: string;
  priorityScore: number;
  location: { lat: number; lng: number };
}

interface Donation {
  id: string;
  donorName: string;
  category: string;
  quantity: string;
  status: string;
  location: { lat: number; lng: number };
}

interface AreaStat {
  district: string;
  lat: number;
  lng: number;
  requestCount: number;
  avgSeverity: number;
  level: "low" | "moderate" | "high";
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

interface Alert {
  title: string;
  link: string | null;
  pubDate: string | null;
  summary: string;
}

interface GdacsEvent {
  eventId: number | null;
  eventType: string | null;
  eventName: string | null;
  alertLevel: string | null;
  title: string;
  summary: string;
  link: string | null;
  fromDate: string | null;
  toDate: string | null;
  country: string | null;
  location: { lat: number; lng: number } | null;
  severityText: string | null;
  geometry: [number, number][] | null;
}

const GDACS_EVENT_TYPE_LABEL: Record<string, string> = {
  TC: "Tropical Cyclone",
  EQ: "Earthquake",
  FL: "Flood",
  DR: "Drought",
  WF: "Wildfire",
  VO: "Volcano",
};

const GDACS_ALERT_COLOR: Record<string, string> = {
  Green: "bg-green-100 text-green-800",
  Orange: "bg-amber-100 text-amber-800",
  Red: "bg-red-100 text-red-800",
};

interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depthKm: number | null;
  tsunami: boolean;
  url: string;
  lat: number;
  lng: number;
}

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "bg-red-100 text-red-800";
  if (mag >= 5) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

// Same red/amber values as SEVERITY_COLOR/GDACS_ALERT_LEAFLET_COLOR below,
// re-keyed by earthquake magnitude for the map layer.
function magnitudeLeafletColor(mag: number): string {
  if (mag >= 6) return "#dc2626";
  if (mag >= 5) return "#f59e0b";
  return "#6b7280";
}

interface CommunityReport {
  id: string;
  type: "road_closure" | "water_level" | "other";
  description: string;
  district: string;
  verifiedAt: string;
}

interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  source: "irrigation_department" | "ceb_mahaweli";
  lat?: number | null;
  lng?: number | null;
  locationApproximate?: boolean;
  district: string | null;
  division: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
  rainfallMm: number | null;
  spilling: boolean;
  date: string | null;
  riskLevel: "normal" | "elevated" | "high" | "spilling";
}

const RESERVOIR_RISK_LABEL: Record<string, string> = {
  elevated: "Elevated storage",
  high: "Near capacity",
  spilling: "Spilling",
  normal: "Normal",
};

const RESERVOIR_RISK_BADGE: Record<string, string> = {
  elevated: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  spilling: "bg-red-100 text-red-800",
  normal: "bg-gray-100 text-gray-700",
};

// Same hue progression as GAUGE_STATUS_COLOR (normal/alert/minor_flood/
// major_flood) — reservoir risk is a different metric (storage %, not flow)
// but the same "how worried should I be" gradient reads consistently on the
// same map. Used only for the 3 CEB reservoirs (Kotmale/Victoria/
// Randenigala), which have real coordinates — see RESERVOIR_APPROX_COLOR
// just below for the other 109, which don't.
const RESERVOIR_RISK_MAP_COLOR: Record<string, string> = {
  normal: "#2563eb",
  elevated: "#f59e0b",
  high: "#f97316",
  spilling: "#dc2626",
};

// The 109 Irrigation Dept reservoirs have no coordinates in their source
// data at all — only a district name — so they're plotted at their
// district's centroid instead (falls back to nearestDistrict()'s existing
// 25-district list server-side). A single light-pink color, deliberately
// NOT risk-graduated like the CEB markers above, signals "approximate
// district-level position, check the popup for the real risk level" rather
// than implying this pin's location is as precise as the other markers on
// this map. Reservoirs sharing a district stack on the same point — an
// honest reflection of the source data's limits, not a rendering bug.
const RESERVOIR_APPROX_COLOR = "#f9a8d4";

// Shared between the Irrigation Department and CEB Mahaweli sub-lists —
// same card layout, just a different set of stats available per source
// (levelMsl only exists for CEB entries, rainfall/date only for irrigation).
function ReservoirListItem({ r }: { r: Reservoir }) {
  return (
    <li className="rounded border border-gray-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${RESERVOIR_RISK_BADGE[r.riskLevel]}`}>
          {RESERVOIR_RISK_LABEL[r.riskLevel]}
        </span>
        <span className="text-sm font-medium text-gray-900">{r.name}</span>
        <span className="text-xs text-gray-400">({r.size})</span>
        {r.district && <span className="text-sm text-gray-500">→ {r.district} district</span>}
      </div>
      <p className="mt-1 text-gray-600">
        {r.effectiveStoragePercent != null ? `${r.effectiveStoragePercent}% capacity` : "Capacity unknown"}
        {r.levelMsl != null && ` · ${r.levelMsl} m MSL`}
        {r.rainfallMm != null && r.rainfallMm > 0 && ` · ${r.rainfallMm}mm rain (preceding day)`}
      </p>
      {r.date && <p className="mt-1 text-xs text-gray-400">As of {r.date}</p>}
    </li>
  );
}

const COMMUNITY_REPORT_TYPE_LABEL: Record<string, string> = {
  road_closure: "Road closure",
  water_level: "Water level / flooding",
  other: "Other condition",
};

const EARTHQUAKE_MAGNITUDE_LEGEND: [string, string][] = [
  ["M 6.0+", "#dc2626"],
  ["M 5.0–5.9", "#f59e0b"],
  ["M 4.0–4.9", "#6b7280"],
];

// react-leaflet's MapContainer only sets center/zoom on first mount — this
// recenters the existing map instance when the admin switches to the
// earthquakes tab in "regional" scope, since those events are hundreds of km
// outside the zoom-8 Sri-Lanka-only view every other tab (and the "sri-lanka"
// scope, which queries a box roughly matching that same view) uses.
function MapViewController({ viewMode, earthquakeScope }: { viewMode: ViewMode; earthquakeScope: "sri-lanka" | "regional" }) {
  const map = useMap();
  useEffect(() => {
    if (viewMode === "earthquakes" && earthquakeScope === "regional") {
      map.setView([8, 87], 5);
    } else {
      map.setView(SRI_LANKA_CENTER, 8);
    }
  }, [viewMode, earthquakeScope, map]);
  return null;
}

// Same hex values as SEVERITY_COLOR/AREA_LEVEL_COLOR/GAUGE_STATUS_COLOR below
// — re-keyed by GDACS's own Green/Orange/Red alert level instead of a
// status string, so the map layer uses the exact colors already on this page.
const GDACS_ALERT_LEAFLET_COLOR: Record<string, string> = {
  Green: "#16a34a",
  Orange: "#f97316",
  Red: "#dc2626",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#16a34a",
};

const AREA_LEVEL_COLOR: Record<string, string> = {
  high: "#dc2626",
  moderate: "#f59e0b",
  low: "#16a34a",
};

const AREA_LEVEL_LABEL: Record<string, string> = {
  high: "High need",
  moderate: "Moderate need",
  low: "Low need",
};

const GAUGE_STATUS_COLOR: Record<string, string> = {
  major_flood: "#dc2626",
  minor_flood: "#f97316",
  alert: "#f59e0b",
  normal: "#2563eb",
};

const GAUGE_STATUS_LABEL: Record<string, string> = {
  major_flood: "Major flood",
  minor_flood: "Minor flood",
  alert: "Alert level",
  normal: "Normal",
};

const DONATION_COLOR = "#2563eb";
const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];

type ViewMode = "requests" | "areas" | "gauges" | "reservoirs" | "gdacs" | "earthquakes";

export default function SituationMap() {
  const [viewMode, setViewMode] = useState<ViewMode>("requests");
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [gauges, setGauges] = useState<GaugeStation[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [gdacsEvents, setGdacsEvents] = useState<GdacsEvent[]>([]);
  const [gdacsScope, setGdacsScope] = useState<"sri-lanka" | "global">("sri-lanka");
  const [gdacsLoading, setGdacsLoading] = useState(false);
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [earthquakeScope, setEarthquakeScope] = useState<"sri-lanka" | "regional">("sri-lanka");
  const [earthquakeLoading, setEarthquakeLoading] = useState(false);
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [showAllReservoirs, setShowAllReservoirs] = useState(false);
  const [loading, setLoading] = useState(true);
  const [areasLoaded, setAreasLoaded] = useState(false);
  const [gaugesLoaded, setGaugesLoaded] = useState(false);
  const [alertDistrict, setAlertDistrict] = useState<Record<number, string>>({});
  const [markingAlert, setMarkingAlert] = useState<number | null>(null);
  const [markedAlerts, setMarkedAlerts] = useState<Record<number, string>>({});

  useEffect(() => {
    Promise.all([
      apiFetch("/api/requests"),
      apiFetch("/api/donations"),
      apiFetch("/api/external/alerts"),
      apiFetch("/api/external/gdacs"),
      apiFetch("/api/external/earthquakes"),
      apiFetch("/api/community-reports/verified"),
      apiFetch("/api/external/reservoirs"),
    ])
      .then(([requestsData, donationsData, alertsData, gdacsData, earthquakeData, communityReportsData, reservoirsData]) => {
        setRequests(requestsData);
        setDonations(donationsData);
        setAlerts(alertsData);
        setGdacsEvents(gdacsData);
        setEarthquakes(earthquakeData);
        setCommunityReports(communityReportsData);
        setReservoirs(reservoirsData);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    // Skip the initial mount — the Promise.all above already fetched the
    // default (sri-lanka) scope. This only re-fetches when the admin
    // switches scope from the toggle below.
    if (loading) return;
    setGdacsLoading(true);
    apiFetch(`/api/external/gdacs?scope=${gdacsScope}`)
      .then(setGdacsEvents)
      .finally(() => setGdacsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gdacsScope]);

  useEffect(() => {
    // Same skip-initial-mount reasoning as the GDACS effect above — the
    // Promise.all already fetched the default (sri-lanka) scope.
    if (loading) return;
    setEarthquakeLoading(true);
    apiFetch(`/api/external/earthquakes?scope=${earthquakeScope}`)
      .then(setEarthquakes)
      .finally(() => setEarthquakeLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earthquakeScope]);

  async function markAlertDistrictActive(index: number, alertTitle: string) {
    const district = alertDistrict[index];
    if (!district) return;
    setMarkingAlert(index);
    try {
      await apiFetch("/api/active-districts", {
        method: "POST",
        body: JSON.stringify({ district, sourceAlertTitle: alertTitle }),
      });
      setMarkedAlerts((prev) => ({ ...prev, [index]: district }));
    } finally {
      setMarkingAlert(null);
    }
  }

  useEffect(() => {
    if (viewMode === "areas" && !areasLoaded) {
      apiFetch("/api/stats/by-area").then((data) => {
        setAreas(data);
        setAreasLoaded(true);
      });
    }
    if (viewMode === "gauges" && !gaugesLoaded) {
      apiFetch("/api/external/water-levels").then((data) => {
        setGauges(data);
        setGaugesLoaded(true);
      });
    }
  }, [viewMode, areasLoaded, gaugesLoaded]);

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Situation Map</h1>
        <p className="text-sm text-gray-500">Admin only</p>
      </div>

      <div className="mt-4 flex gap-2">
        <button
          onClick={() => setViewMode("requests")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "requests" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          Requests
        </button>
        <button
          onClick={() => setViewMode("areas")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "areas" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          Areas Affected
        </button>
        <button
          onClick={() => setViewMode("gauges")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "gauges" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          River Gauges
        </button>
        <button
          onClick={() => setViewMode("reservoirs")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "reservoirs" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          Reservoirs
        </button>
        <button
          onClick={() => setViewMode("gdacs")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "gdacs" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          Global Alerts (GDACS)
        </button>
        <button
          onClick={() => setViewMode("earthquakes")}
          className={`rounded px-4 py-2 text-sm font-medium ${
            viewMode === "earthquakes" ? "bg-orange-600 text-white" : "bg-white text-gray-700 hover:bg-gray-100"
          } border border-gray-300`}
        >
          Tsunami Risk (Earthquakes)
        </button>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <>
          <div className="mb-4 mt-4 flex flex-wrap gap-4 text-xs text-gray-600">
            {viewMode === "requests" && (
              <>
                {Object.entries(SEVERITY_COLOR).map(([severity, color]) => (
                  <div key={severity} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    <span className="capitalize">{severity} request</span>
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: DONATION_COLOR }} />
                  Donation pickup
                </div>
              </>
            )}
            {viewMode === "areas" &&
              Object.entries(AREA_LEVEL_LABEL).map(([level, label]) => (
                <div key={level} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: AREA_LEVEL_COLOR[level] }}
                  />
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
                {Object.entries(RESERVOIR_RISK_MAP_COLOR).map(([level, color]) => (
                  <div key={`reservoir-${level}`} className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    {RESERVOIR_RISK_LABEL[level]} (exact)
                  </div>
                ))}
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-3 rounded-full"
                    style={{ backgroundColor: RESERVOIR_APPROX_COLOR }}
                  />
                  Approximate (district centroid) — see popup for risk level
                </div>
              </>
            )}
            {viewMode === "gdacs" &&
              Object.entries(GDACS_ALERT_LEAFLET_COLOR).map(([level, color]) => (
                <div key={`gdacs-${level}`} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  GDACS {level} alert
                </div>
              ))}
            {viewMode === "earthquakes" &&
              EARTHQUAKE_MAGNITUDE_LEGEND.map(([label, color]) => (
                <div key={`eq-${label}`} className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                  {label}
                </div>
              ))}
          </div>

          {viewMode === "gauges" && (
            <p className="mb-4 text-xs text-gray-400">
              Live data from the Department of Irrigation's own public gauge network — the same feed behind
              their official "Realtime Water Level in Major River" dashboard.
            </p>
          )}

          {viewMode === "reservoirs" && (
            <p className="mb-4 text-xs text-gray-400">
              Kotmale, Victoria, and Randenigala (CEB/Mahaweli hydropower reservoirs) have real coordinates,
              shown in their risk color. The 109 Irrigation Department reservoirs have no location data in
              their source bulletin at all, so they're shown in light pink at their district's centroid —
              click a pin for its actual risk level and details; see the full list below the map too.
            </p>
          )}
          {viewMode === "reservoirs" &&
            reservoirs.filter((r) => r.lat != null && r.lng != null).length === 0 && (
              <p className="mb-4 text-sm text-gray-500">Reservoir location data is temporarily unavailable.</p>
            )}

          {viewMode === "earthquakes" && (
            <p className="mb-4 text-xs text-gray-400">
              Magnitude 4.0+ earthquakes over the last 30 days
              {earthquakeScope === "regional"
                ? " across the Indian Ocean / Bay of Bengal / Sumatra subduction zone — the region that produced the 2004 Indian Ocean tsunami. This is a regional tsunami-risk indicator, not a Sri Lanka earthquake feed, which is why the map re-centers on the wider region for this scope."
                : " within Sri Lanka and its immediate waters."}{" "}
              Sri Lanka itself sits on stable crust and rarely has local seismic activity.
            </p>
          )}

          {viewMode === "earthquakes" && (
            <div className="mb-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={earthquakeScope === "regional"}
                  onChange={(e) => setEarthquakeScope(e.target.checked ? "regional" : "sri-lanka")}
                />
                Show all regional events
                <span className="text-xs text-gray-400">
                  (Sri Lanka rarely has one — switch this on to see real earthquake data across the wider region)
                </span>
              </label>
              {earthquakeLoading && <span className="text-xs text-gray-400">Loading...</span>}
            </div>
          )}

          {viewMode === "earthquakes" && !earthquakeLoading && earthquakes.length === 0 && (
            <p className="mb-4 text-sm text-gray-500">
              {earthquakeScope === "regional"
                ? "No magnitude 4.0+ earthquakes in the region in the last 30 days."
                : "No magnitude 4.0+ earthquakes within Sri Lanka's immediate waters in the last 30 days — expected most days; try \"Show all regional events\" above."}
            </p>
          )}

          {viewMode === "gdacs" && (
            <div className="mb-4 flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={gdacsScope === "global"}
                  onChange={(e) => setGdacsScope(e.target.checked ? "global" : "sri-lanka")}
                />
                Show all global events
                <span className="text-xs text-gray-400">
                  (Sri Lanka rarely has an active one — switch this on to see real live GDACS data worldwide)
                </span>
              </label>
              {gdacsLoading && <span className="text-xs text-gray-400">Loading...</span>}
            </div>
          )}

          {viewMode === "gdacs" && !gdacsLoading && gdacsEvents.length === 0 && (
            <p className="mb-4 text-sm text-gray-500">
              {gdacsScope === "global"
                ? "No current GDACS events found."
                : "No GDACS-tracked events relevant to Sri Lanka right now."}
            </p>
          )}

          <div className="overflow-hidden rounded-xl border border-gray-200" style={{ height: "600px" }}>
            <MapContainer center={SRI_LANKA_CENTER} zoom={8} style={{ height: "100%", width: "100%" }}>
              <MapViewController viewMode={viewMode} earthquakeScope={earthquakeScope} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {viewMode === "requests" &&
                requests
                  .filter((r) => r.location)
                  .map((r) => (
                    <CircleMarker
                      key={r.id}
                      center={[r.location.lat, r.location.lng]}
                      radius={8}
                      pathOptions={{
                        color: SEVERITY_COLOR[r.severity] || "#6b7280",
                        fillColor: SEVERITY_COLOR[r.severity] || "#6b7280",
                        fillOpacity: 0.7,
                      }}
                    >
                      <Popup>
                        <strong>{r.victimName}</strong>
                        <br />
                        {r.disasterType} · <span className="capitalize">{r.severity}</span> severity
                        <br />
                        Priority {r.priorityScore?.toFixed(0)} · {r.status}
                      </Popup>
                    </CircleMarker>
                  ))}
              {viewMode === "requests" &&
                donations
                  .filter((d) => d.location)
                  .map((d) => (
                    <CircleMarker
                      key={d.id}
                      center={[d.location.lat, d.location.lng]}
                      radius={6}
                      pathOptions={{ color: DONATION_COLOR, fillColor: DONATION_COLOR, fillOpacity: 0.6 }}
                    >
                      <Popup>
                        <strong>{d.donorName}</strong>
                        <br />
                        {d.category} — {d.quantity}
                        <br />
                        {d.status}
                      </Popup>
                    </CircleMarker>
                  ))}
              {viewMode === "areas" &&
                areas.map((area) => (
                  <CircleMarker
                    key={area.district}
                    center={[area.lat, area.lng]}
                    radius={Math.min(10 + area.requestCount * 3, 40)}
                    pathOptions={{
                      color: AREA_LEVEL_COLOR[area.level],
                      fillColor: AREA_LEVEL_COLOR[area.level],
                      fillOpacity: 0.5,
                    }}
                  >
                    <Popup>
                      <strong>{area.district}</strong>
                      <br />
                      {area.requestCount} active request{area.requestCount === 1 ? "" : "s"}
                      <br />
                      {AREA_LEVEL_LABEL[area.level]}
                    </Popup>
                  </CircleMarker>
                ))}
              {viewMode === "gauges" &&
                gauges.map((g) => (
                  <CircleMarker
                    key={g.station}
                    center={[g.lat, g.lng]}
                    radius={8}
                    pathOptions={{
                      color: GAUGE_STATUS_COLOR[g.status],
                      fillColor: GAUGE_STATUS_COLOR[g.status],
                      fillOpacity: 0.7,
                    }}
                  >
                    <Popup>
                      <strong>{g.station}</strong> ({g.basin})
                      <br />
                      Level: {g.waterLevel ?? "—"} m
                      <br />
                      Alert {g.alertLevel ?? "—"} · Minor flood {g.minorFloodLevel ?? "—"} · Major flood{" "}
                      {g.majorFloodLevel ?? "—"}
                      <br />
                      {GAUGE_STATUS_LABEL[g.status]}
                    </Popup>
                  </CircleMarker>
                ))}
              {viewMode === "reservoirs" &&
                reservoirs
                  .filter((r) => r.lat != null && r.lng != null)
                  .map((r) => {
                    const color = r.locationApproximate ? RESERVOIR_APPROX_COLOR : RESERVOIR_RISK_MAP_COLOR[r.riskLevel];
                    return (
                      <CircleMarker
                        key={r.name}
                        center={[r.lat as number, r.lng as number]}
                        radius={r.locationApproximate ? 7 : 9}
                        pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                      >
                        <Popup>
                          {r.locationApproximate ? (
                            <>
                              <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${RESERVOIR_RISK_BADGE[r.riskLevel]}`}>
                                {RESERVOIR_RISK_LABEL[r.riskLevel]}
                              </span>
                              <br />
                              <strong>{r.name}</strong> ({r.size})
                              {r.district && <> → {r.district} district</>}
                              <br />
                              {r.effectiveStoragePercent != null ? `${r.effectiveStoragePercent}% capacity` : "Capacity unknown"}
                              {r.date && (
                                <>
                                  <br />
                                  As of {r.date}
                                </>
                              )}
                              <br />
                              <em>Approximate location — district centroid, not the real pin.</em>
                            </>
                          ) : (
                            <>
                              <strong>{r.name}</strong> ({r.size})
                              <br />
                              {r.effectiveStoragePercent != null ? `${r.effectiveStoragePercent}% capacity` : "Capacity unknown"}
                              {r.levelMsl != null && ` · ${r.levelMsl} m MSL`}
                              <br />
                              {RESERVOIR_RISK_LABEL[r.riskLevel]}
                            </>
                          )}
                        </Popup>
                      </CircleMarker>
                    );
                  })}
              {viewMode === "gdacs" &&
                gdacsEvents.map((event) => {
                  const color = GDACS_ALERT_LEAFLET_COLOR[event.alertLevel || ""] || "#6b7280";
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
                          <Popup>
                            <strong>{event.eventName || event.title}</strong>
                            <br />
                            {event.severityText}
                            <br />
                            {event.fromDate ? new Date(event.fromDate).toLocaleDateString() : "—"} –{" "}
                            {event.toDate ? new Date(event.toDate).toLocaleDateString() : "—"}
                          </Popup>
                        </CircleMarker>
                      )}
                    </Fragment>
                  );
                })}
              {viewMode === "earthquakes" &&
                earthquakes.map((eq) => {
                  const color = magnitudeLeafletColor(eq.magnitude);
                  return (
                    <CircleMarker
                      key={eq.id}
                      center={[eq.lat, eq.lng]}
                      radius={5 + eq.magnitude}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.7 }}
                    >
                      <Popup>
                        <strong>M {eq.magnitude.toFixed(1)} — {eq.place}</strong>
                        <br />
                        {new Date(eq.time).toLocaleString()}
                        {eq.depthKm != null && ` · ${eq.depthKm.toFixed(0)} km deep`}
                        {eq.tsunami && (
                          <>
                            <br />
                            <span className="font-medium text-blue-700">Tsunami potential flagged</span>
                          </>
                        )}
                      </Popup>
                    </CircleMarker>
                  );
                })}
            </MapContainer>
          </div>

          {viewMode === "areas" && areasLoaded && areas.length === 0 && (
            <p className="mt-4 text-sm text-gray-500">No active requests recorded yet.</p>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-900">Recent DMC Emergency Warnings</h2>
            <p className="mt-1 text-xs text-gray-400">
              DMC alerts are a suggestion, not automatic — pick the district the bulletin describes and mark
              it active yourself rather than relying on parsing the district out of the text.
            </p>
            {alerts.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No active DMC warnings right now.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {alerts.map((alert, i) => (
                  <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
                    <a
                      href={alert.link || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 hover:underline"
                    >
                      {alert.title}
                    </a>
                    {alert.pubDate && <p className="text-xs text-gray-400">{alert.pubDate}</p>}
                    {alert.summary && <p className="mt-1 text-gray-600">{alert.summary}</p>}

                    <div className="mt-2 flex items-center gap-2">
                      <select
                        value={alertDistrict[i] || ""}
                        onChange={(e) => setAlertDistrict((prev) => ({ ...prev, [i]: e.target.value }))}
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">District this affects...</option>
                        {DISTRICTS.map((d) => (
                          <option key={d.name} value={d.name}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={!alertDistrict[i] || markingAlert === i}
                        onClick={() => markAlertDistrictActive(i, alert.title)}
                        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {markingAlert === i ? "Marking..." : "Mark active"}
                      </button>
                      {markedAlerts[i] && (
                        <span className="text-xs font-medium text-green-700">
                          ✓ {markedAlerts[i]} marked active
                        </span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-900">Reservoir Storage Levels</h2>
            <p className="mt-1 text-xs text-gray-400">
              Describes current officially-reported state only — never a prediction of when a gate might open.
              Two separate operators, two separate feeds, shown as distinct groups rather than one undifferentiated
              list. Manage automatic vs. review-first notifications at{" "}
              <a href="/admin/water-alerts" className="text-slate-700 hover:underline">
                Water Level & Reservoir Area Alerts
              </a>
              .
            </p>

            {(() => {
              const irrigation = reservoirs.filter((r) => r.source === "irrigation_department");
              const flagged = irrigation.filter((r) => r.riskLevel !== "normal");
              const visible = showAllReservoirs ? irrigation : flagged;
              return (
                <div className="mt-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Irrigation Department Major & Medium Reservoirs
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Daily storage % and spilling status for {irrigation.length} irrigation reservoirs, from the
                    Irrigation Department's own published bulletin.
                  </p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={showAllReservoirs}
                      onChange={(e) => setShowAllReservoirs(e.target.checked)}
                    />
                    Show all {irrigation.length} reservoirs (default: only elevated/near-capacity/spilling)
                  </label>
                  {visible.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">
                      {flagged.length === 0 ? "No reservoirs currently at elevated storage." : "No reservoirs to show."}
                    </p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {visible.map((r) => (
                        <ReservoirListItem key={r.name} r={r} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {(() => {
              const hydro = reservoirs.filter((r) => r.source === "ceb_mahaweli");
              return (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Hydropower & Mahaweli Reservoirs
                  </h3>
                  <p className="mt-1 text-xs text-gray-400">
                    Level (MSL) and active storage % from CEB's Mahaweli Complex daily 6:00 AM bulletin — a separate
                    operator from the Irrigation Department above. Only Kotmale, Victoria, and Randenigala publish a
                    water-level figure here; Rantambe, Upper Kotmale, and the Laxapana-complex reservoirs
                    (Castlereigh, Maussakelle, Samanalawewa) aren't available from this source.
                  </p>
                  {hydro.length === 0 ? (
                    <p className="mt-2 text-sm text-gray-500">Hydropower reservoir data is temporarily unavailable.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {hydro.map((r) => (
                        <ReservoirListItem key={r.name} r={r} />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}
          </div>

          {viewMode === "gdacs" && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-gray-900">Global Disaster Alerts (GDACS)</h2>
              <p className="mt-1 text-xs text-gray-400">
                Tropical cyclone tracking and general disaster events from the Global Disaster Alert and
                Coordination System (EC Joint Research Centre)
                {gdacsScope === "global" ? " — showing all current events worldwide." : ", filtered to ones relevant to Sri Lanka."}
              </p>
              {gdacsEvents.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  {gdacsScope === "global"
                    ? "No current GDACS events found."
                    : "No GDACS-tracked events relevant to Sri Lanka right now."}
                </p>
              ) : (
                <>
                  {gdacsScope === "global" && gdacsEvents.length > 20 && (
                    <p className="mt-2 text-xs text-gray-400">
                      Showing 20 of {gdacsEvents.length} current events worldwide.
                    </p>
                  )}
                  <ul className="mt-2 space-y-2">
                    {gdacsEvents.slice(0, gdacsScope === "global" ? 20 : undefined).map((event) => (
                      <li key={event.eventId} className="rounded border border-gray-200 bg-white p-3 text-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                            {GDACS_EVENT_TYPE_LABEL[event.eventType || ""] || event.eventType}
                          </span>
                          {event.alertLevel && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                GDACS_ALERT_COLOR[event.alertLevel] || "bg-gray-100 text-gray-700"
                              }`}
                            >
                              {event.alertLevel}
                            </span>
                          )}
                          <a
                            href={event.link || undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="font-medium text-slate-700 hover:underline"
                          >
                            {event.eventName || event.title}
                          </a>
                        </div>
                        {event.summary && <p className="mt-1 text-gray-600">{event.summary}</p>}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}

          {viewMode === "earthquakes" && (
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-gray-900">Regional Seismic Activity — Tsunami Risk Indicator</h2>
              <p className="mt-1 text-xs text-gray-400">
                Recent magnitude 4.0+ earthquakes from USGS
                {earthquakeScope === "regional"
                  ? " across the Indian Ocean / Bay of Bengal / Sumatra subduction zone — the region that produced the 2004 Indian Ocean tsunami — showing all current regional events."
                  : " within Sri Lanka and its immediate waters."}{" "}
                Sri Lanka itself sits on stable crust and rarely has local seismic activity; this is a tsunami-risk
                indicator, not a guaranteed-populated Sri Lanka earthquake feed.
              </p>
              {earthquakes.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">
                  {earthquakeScope === "regional"
                    ? "No magnitude 4.0+ earthquakes in the region in the last 30 days."
                    : "No magnitude 4.0+ earthquakes within Sri Lanka's immediate waters in the last 30 days — expected most days; switch to \"Show all regional events\" above the map to see real regional data."}
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {earthquakes.map((eq) => (
                    <li key={eq.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${magnitudeColor(eq.magnitude)}`}>
                          M {eq.magnitude.toFixed(1)}
                        </span>
                        {eq.tsunami && (
                          <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            Tsunami potential flagged
                          </span>
                        )}
                        <a
                          href={eq.url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-slate-700 hover:underline"
                        >
                          {eq.place}
                        </a>
                      </div>
                      <p className="mt-1 text-gray-600">
                        {new Date(eq.time).toLocaleString()}
                        {eq.depthKm != null && ` · ${eq.depthKm.toFixed(0)} km deep`}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <div className="mt-6">
            <h2 className="text-sm font-semibold text-gray-900">Verified Community Reports</h2>
            <p className="mt-1 text-xs text-gray-400">
              Road closures and water conditions reported by volunteers in the field, verified by an admin. Manage
              and verify new ones at{" "}
              <a href="/admin/community-reports" className="text-slate-700 hover:underline">
                Community Reports
              </a>
              .
            </p>
            {communityReports.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No verified community reports right now.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {communityReports.map((r) => (
                  <li key={r.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {COMMUNITY_REPORT_TYPE_LABEL[r.type]}
                      </span>
                      <span className="text-sm font-medium text-gray-900">{r.district} district</span>
                    </div>
                    <p className="mt-1 text-gray-600">{r.description}</p>
                    <p className="mt-1 text-xs text-gray-400">{new Date(r.verifiedAt).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
