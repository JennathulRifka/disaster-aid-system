import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, AccessibilityInfo, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { collection, onSnapshot } from "firebase/firestore";
import MapView, { Marker, Geojson, PROVIDER_GOOGLE } from "react-native-maps";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { dotImage } from "../../lib/markerDots";
import { DistrictSearchBox, type DistrictOption } from "../../components/DistrictSearchBox";
import { CountrySearchBox, type CountryFeature } from "../../components/CountrySearchBox";
import { regionForGeometry } from "../../lib/geoBounds";

interface SelectedMarker {
  title: string;
  lines: string[];
}

interface AidRequest {
  id: string;
  victimName: string;
  disasterType: string;
  severity: string;
  status: string;
  priorityScore: number;
  location?: { lat: number; lng: number };
}

interface Donation {
  id: string;
  donorName: string;
  category: string;
  status: string;
  location?: { lat: number; lng: number };
}

interface AreaStat {
  district: string;
  lat: number;
  lng: number;
  requestCount: number;
  level: "low" | "moderate" | "high";
}

interface GaugeStation {
  station: string;
  basin: string;
  lat: number;
  lng: number;
  waterLevel: number | null;
  status: "normal" | "alert" | "minor_flood" | "major_flood";
}

interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  source: "irrigation_department" | "ceb_mahaweli";
  lat?: number | null;
  lng?: number | null;
  locationApproximate?: boolean;
  district: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
  rainfallMm?: number | null;
  date?: string | null;
  riskLevel: "normal" | "elevated" | "high" | "spilling";
}

interface GdacsEvent {
  eventId: number | null;
  eventType: string | null;
  eventName: string | null;
  alertLevel: string | null;
  title: string;
  location: { lat: number; lng: number } | null;
  severityText: string | null;
}

interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  lat: number;
  lng: number;
}

// A district's live NASA POWER rainfall fetch can fail independently of the
// others (GET /api/external/flood-risk fails soft per-district) — that
// shape has none of the fields below, just `error: true` + `message`, so
// every consumer of this list must filter those out before assuming
// lat/lng/riskLevel exist.
interface FloodRiskDistrict {
  district: string;
  lat: number;
  lng: number;
  probability: number;
  riskLevel: "low" | "moderate" | "elevated" | "high";
  error?: boolean;
}

// Loose local shape, same convention CountrySearchBox.tsx already uses
// (rather than importing the `geojson` npm package's stricter types) — real
// Sri Lanka district (admin-2) boundary polygons from HDX's COD-AB dataset,
// simplified server-side. See GET /api/external/district-boundaries and
// web's SituationMap.tsx's identical DistrictBoundaryProps.
interface DistrictBoundaryFeature {
  type: "Feature";
  properties: { district: string; districtSi: string; districtTa: string; province: string; pcode: string; areaSqKm: number };
  geometry: { type: string; coordinates: unknown };
}
interface DistrictBoundaryCollection {
  type: "FeatureCollection";
  features: DistrictBoundaryFeature[];
}

// Same hex values as SituationMap.tsx on web — exact victim/donation
// pinpoints, admin-only. Never surface this data on a public/non-admin
// screen (see "Privacy and security notes" in CLAUDE.md).
const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  high: "#f97316",
  medium: "#f59e0b",
  low: "#16a34a",
};
const DONATION_COLOR = "#2563eb";
const LEVEL_COLOR: Record<string, string> = { high: "#dc2626", moderate: "#f59e0b", low: "#16a34a", none: "#9ca3af" };
const LEVEL_LABEL: Record<string, string> = { high: "High need", moderate: "Moderate need", low: "Low need", none: "No activity" };
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
const RESERVOIR_RISK_COLOR: Record<string, string> = {
  normal: "#2563eb",
  elevated: "#f59e0b",
  high: "#f97316",
  spilling: "#dc2626",
};
const RESERVOIR_APPROX_COLOR = "#f9a8d4";
const RESERVOIR_RISK_LABEL: Record<string, string> = {
  normal: "Normal",
  elevated: "Elevated storage",
  high: "Near capacity",
  spilling: "Spilling",
};
const RESERVOIR_RISK_BADGE_CLASS: Record<string, string> = {
  normal: "bg-gray-100",
  elevated: "bg-amber-100",
  high: "bg-orange-100",
  spilling: "bg-red-100",
};
const RESERVOIR_RISK_TEXT_CLASS: Record<string, string> = {
  normal: "text-gray-700",
  elevated: "text-amber-800",
  high: "text-orange-800",
  spilling: "text-red-800",
};

// Shared between the Irrigation Department and CEB Mahaweli sub-lists below
// — same card layout as the public SeverityMapScreen.tsx's ReservoirCard,
// but every risk level gets a badge (including "normal"), matching web's
// admin ReservoirListItem exactly — this is the technical/complete view,
// unlike the public list's "only show a badge when something's actually
// wrong" treatment.
function ReservoirCard({ r }: { r: Reservoir }) {
  return (
    <View className="rounded border border-gray-200 bg-white p-3">
      <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
        <View className={`rounded-full px-2 py-0.5 ${RESERVOIR_RISK_BADGE_CLASS[r.riskLevel]}`}>
          <Text className={`text-xs font-medium ${RESERVOIR_RISK_TEXT_CLASS[r.riskLevel]}`}>
            {RESERVOIR_RISK_LABEL[r.riskLevel]}
          </Text>
        </View>
        <Text className="text-sm font-medium text-gray-900">{r.name}</Text>
        <Text className="text-xs text-gray-400">({r.size})</Text>
        {r.district && <Text className="text-sm text-gray-500">→ {r.district} district</Text>}
      </View>
      <Text className="mt-1 text-sm text-gray-600">
        {r.effectiveStoragePercent != null ? `${r.effectiveStoragePercent}% capacity` : "Capacity unknown"}
        {r.levelMsl != null ? ` · ${r.levelMsl} m MSL` : ""}
        {r.rainfallMm != null && r.rainfallMm > 0 ? ` · ${r.rainfallMm}mm rain (preceding day)` : ""}
      </Text>
      {r.date && <Text className="mt-1 text-xs text-gray-400">As of {r.date}</Text>}
    </View>
  );
}
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
const EARTHQUAKE_LEGEND: [string, string][] = [
  ["M 6.0+", "#dc2626"],
  ["M 5.0–5.9", "#f59e0b"],
  ["M 4.0–4.9", "#6b7280"],
];
const FLOOD_RISK_COLOR: Record<string, string> = {
  low: "#16a34a",
  moderate: "#f59e0b",
  elevated: "#f97316",
  high: "#dc2626",
};
const FLOOD_RISK_LABEL: Record<string, string> = {
  low: "Low risk",
  moderate: "Moderate risk",
  elevated: "Elevated risk",
  high: "High risk",
};

const SRI_LANKA_REGION = { latitude: 7.8731, longitude: 80.7718, latitudeDelta: 3.2, longitudeDelta: 3.2 };
const REGIONAL_REGION = { latitude: 8, longitude: 87, latitudeDelta: 20, longitudeDelta: 20 };

function ColorDot({ color, size = 16 }: { color: string; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: color,
        borderWidth: 2,
        borderColor: "white",
      }}
    />
  );
}

type ViewMode = "requests" | "areas" | "gauges" | "reservoirs" | "gdacs" | "earthquakes" | "floodRisk";

const TABS: { key: ViewMode; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "areas", label: "Areas Affected" },
  { key: "gauges", label: "River Gauges" },
  { key: "reservoirs", label: "Reservoirs" },
  { key: "gdacs", label: "Global Alerts" },
  { key: "earthquakes", label: "Tsunami Risk" },
  { key: "floodRisk", label: "Flood Risk" },
];

// The 5 Sri-Lanka-focused tabs get district search; GDACS/Earthquakes (world
// data) get country search instead — same split web's admin map already
// uses (two different search boxes for two different data domains).
const LOCAL_TABS = new Set<ViewMode>(["requests", "areas", "gauges", "reservoirs", "floodRisk"]);

function legendFor(viewMode: ViewMode): [string, string][] {
  switch (viewMode) {
    case "requests":
      return [
        ...Object.entries(SEVERITY_COLOR).map(([k, c]) => [`${k} request`, c] as [string, string]),
        ["Donation pickup", DONATION_COLOR],
      ];
    case "areas":
      return Object.entries(LEVEL_LABEL).map(([k, label]) => [label, LEVEL_COLOR[k]]);
    case "gauges":
      return Object.entries(GAUGE_STATUS_LABEL).map(([k, label]) => [label, GAUGE_STATUS_COLOR[k]]);
    case "reservoirs":
      return [
        ...Object.entries(RESERVOIR_RISK_LABEL).map(([k, label]) => [`${label} (exact)`, RESERVOIR_RISK_COLOR[k]] as [string, string]),
        ["Approximate location", RESERVOIR_APPROX_COLOR],
      ];
    case "gdacs":
      return Object.entries(GDACS_ALERT_COLOR).map(([level, color]) => [`GDACS ${level} alert`, color]);
    case "earthquakes":
      return EARTHQUAKE_LEGEND;
    case "floodRisk":
      return Object.entries(FLOOD_RISK_LABEL).map(([k, label]) => [label, FLOOD_RISK_COLOR[k]]);
  }
}

// Admin-only exact pinpoints (Requests tab) + the full set of public
// aggregate layers the shared severity map has too — mirrors web's
// SituationMap.tsx's 7-tab set (minus the country/district search boxes and
// cyclone hazard polygons, desktop conveniences not worth rebuilding here).
export function SituationMapScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>("requests");
  const [selected, setSelected] = useState<SelectedMarker | null>(null);
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [gauges, setGauges] = useState<GaugeStation[]>([]);
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [gdacsEvents, setGdacsEvents] = useState<GdacsEvent[]>([]);
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [floodRisk, setFloodRisk] = useState<FloodRiskDistrict[]>([]);
  const [boundaries, setBoundaries] = useState<DistrictBoundaryCollection | null>(null);
  const [loading, setLoading] = useState(true);
  const [gaugesLoaded, setGaugesLoaded] = useState(false);
  const [reservoirsLoaded, setReservoirsLoaded] = useState(false);
  const [floodRiskLoaded, setFloodRiskLoaded] = useState(false);
  const [boundariesLoaded, setBoundariesLoaded] = useState(false);
  const [gdacsScope, setGdacsScope] = useState<"sri-lanka" | "global">("sri-lanka");
  const [earthquakeScope, setEarthquakeScope] = useState<"sri-lanka" | "regional">("sri-lanka");
  // Two-level disclosure for the Irrigation Dept sub-list (109 reservoirs is
  // a lot of scroll for most admins) — matches web's admin SituationMap.tsx
  // exactly: collapsed behind "View reservoirs" first, then a nested "Show
  // all N" toggle once opened (defaults to flagged-only). The Hydropower
  // sub-list (only 3) has no equivalent toggle, same as web.
  const [showIrrigationReservoirs, setShowIrrigationReservoirs] = useState(false);
  const [showAllReservoirs, setShowAllReservoirs] = useState(false);
  // Persists across tab switches within the 5 local tabs, deliberately — the
  // same low-effort consequence web's own district search has (search
  // Ratnapura on Requests, switch to Reservoirs, still zoomed to Ratnapura).
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictOption | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryFeature | null>(null);

  useEffect(() => {
    const unsubRequests = onSnapshot(collection(db, "aidRequests"), (snapshot) => {
      setRequests(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as AidRequest));
      setLoading(false);
    });
    const unsubDonations = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((d) => ({ id: d.id, ...d.data() }) as Donation));
    });
    return () => {
      unsubRequests();
      unsubDonations();
    };
  }, []);

  useEffect(() => {
    apiFetch("/api/stats/by-area").then(setAreas);
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
    if (viewMode === "floodRisk" && !floodRiskLoaded) {
      apiFetch("/api/external/flood-risk").then((data) => {
        setFloodRisk(data?.districts || []);
        setFloodRiskLoaded(true);
      });
    }
  }, [viewMode, floodRiskLoaded]);

  // Real district (admin-2) polygons instead of centroid dots, so the flood
  // risk tab reads district-by-district the same way web's admin map
  // already does — direct user ask ("district wise colour coded... than
  // dots"). Fetched lazily on first opening this tab, same convention as
  // every other tab's own data. Fails soft to null (see external.js), so
  // this can only ever *improve* the tab, never break it — the existing dot
  // markers below stay as the fallback for as long as boundaries hasn't
  // loaded.
  useEffect(() => {
    if (viewMode === "floodRisk" && !boundariesLoaded) {
      apiFetch("/api/external/district-boundaries")
        .then((data) => setBoundaries(data))
        .catch(() => setBoundaries(null))
        .finally(() => setBoundariesLoaded(true));
    }
  }, [viewMode, boundariesLoaded]);

  // One combined FeatureCollection, each district's own `fill`/`stroke`
  // properties injected per-feature (GeoJSON simplestyle-spec keys) —
  // react-native-maps' <Geojson> reads these directly when the component's
  // own fillColor/strokeColor props are left unset, letting one <Geojson>
  // render all 25 districts in their own colors instead of needing a
  // separate layer per risk level. A district with no real match (still
  // loading, or its own live rainfall fetch failed — see FloodRiskDistrict's
  // `error` field above) gets the same "barely tinted, no popup" treatment
  // web's SituationMap.tsx already uses, rather than being colored as if it
  // had real "low risk" data.
  const floodRiskGeojson = useMemo(() => {
    if (!boundaries) return null;
    return {
      type: "FeatureCollection" as const,
      features: boundaries.features.map((feature) => {
        const match = floodRisk.find((f) => f.district === feature.properties.district && !f.error);
        const color = FLOOD_RISK_COLOR[match?.riskLevel ?? "low"];
        return {
          ...feature,
          properties: {
            ...feature.properties,
            fill: color,
            "fill-opacity": match ? 0.45 : 0.1,
            stroke: color,
            "stroke-width": 1.2,
          },
        };
      }),
    };
  }, [boundaries, floodRisk]);

  useEffect(() => {
    if (viewMode !== "gdacs") return;
    apiFetch(`/api/external/gdacs?scope=${gdacsScope}`).then(setGdacsEvents);
  }, [viewMode, gdacsScope]);

  useEffect(() => {
    if (viewMode !== "earthquakes") return;
    apiFetch(`/api/external/earthquakes?scope=${earthquakeScope}`).then(setEarthquakes);
  }, [viewMode, earthquakeScope]);

  const mapRef = useRef<MapView>(null);

  // Same imperative-recenter approach as the shared AreaSeverityMap.tsx —
  // initialRegion only applies once, so tab/scope switches recenter the
  // already-mounted map instance directly rather than fighting user pan/zoom
  // with a continuously-bound controlled region.
  useEffect(() => {
    if (LOCAL_TABS.has(viewMode) && selectedDistrict) {
      mapRef.current?.animateToRegion(
        { latitude: selectedDistrict.lat, longitude: selectedDistrict.lng, latitudeDelta: 0.9, longitudeDelta: 0.9 },
        400
      );
      return;
    }
    if (viewMode === "gdacs" && selectedCountry) {
      const region = regionForGeometry(selectedCountry.geometry);
      if (region) {
        mapRef.current?.animateToRegion(region, 400);
        return;
      }
    }
    if (viewMode === "earthquakes" && selectedCountry) {
      const region = regionForGeometry(selectedCountry.geometry);
      if (region) {
        mapRef.current?.animateToRegion(region, 400);
        return;
      }
    }
    const target = viewMode === "earthquakes" && earthquakeScope === "regional" ? REGIONAL_REGION : SRI_LANKA_REGION;
    mapRef.current?.animateToRegion(target, 400);
  }, [viewMode, earthquakeScope, selectedDistrict, selectedCountry]);

  // Same rationale as AreaSeverityMap.tsx's identical effect — the detail
  // card is a plain View, not a Modal, so nothing tells a screen reader it
  // appeared unless something says so explicitly.
  useEffect(() => {
    if (selected) {
      AccessibilityInfo.announceForAccessibility(`${selected.title}. ${selected.lines.join(". ")}`);
    }
  }, [selected]);

  // Clears any lingering detail card from a different layer when switching tabs.
  useEffect(() => {
    setSelected(null);
  }, [viewMode]);

  return (
    // Whole-screen ScrollView + a fixed-height map, not flex-1 — the same
    // pattern SeverityMapScreen.tsx/AreaSeverityMap.tsx already use
    // successfully. This is a *vertical* page-scroll change, unrelated to
    // the tab row's own documented horizontal-ScrollView history just below
    // (that was a different, already-abandoned approach for a different
    // element). Needed so the reservoir list panel has somewhere to render
    // without being squeezed into whatever space a flex-1 map didn't take.
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Situation Map</Text>

      {/* Two attempts at a horizontal-ScrollView-based tab row (a nested
          flex-row View, then an explicit ScrollView height) both failed to
          fix real on-device layout bugs the user kept reporting — a
          horizontal ScrollView's own outer sizing on Android turned out to
          be genuinely unpredictable here, not something worth a third guess.
          Switched to the exact flex-wrap pattern AreaSeverityMap.tsx already
          uses successfully for its own tab row (no equivalent gap ever
          reported there) — wraps to a second line on narrow phones instead
          of scrolling, which sidesteps the whole class of ScrollView-sizing
          uncertainty entirely. */}
      <View className="mt-3 flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="tablist">
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setViewMode(tab.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: viewMode === tab.key }}
            className={`rounded border px-3 py-1.5 ${viewMode === tab.key ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"}`}
          >
            <Text className={`text-xs font-medium ${viewMode === tab.key ? "text-white" : "text-gray-700"}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {LOCAL_TABS.has(viewMode) && (
        <DistrictSearchBox
          onSelect={setSelectedDistrict}
          onClear={() => setSelectedDistrict(null)}
          selectedName={selectedDistrict?.name ?? null}
        />
      )}
      {(viewMode === "gdacs" || viewMode === "earthquakes") && (
        <CountrySearchBox
          onSelect={setSelectedCountry}
          onClear={() => setSelectedCountry(null)}
          selectedName={selectedCountry?.properties.name ?? null}
        />
      )}

      {viewMode === "gdacs" && (
        <TouchableOpacity
          onPress={() => setGdacsScope(gdacsScope === "global" ? "sri-lanka" : "global")}
          className="mt-3 self-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5"
        >
          <Text className="text-xs font-medium text-orange-700">
            {gdacsScope === "global" ? "Show Sri Lanka only" : "Show global alerts"}
          </Text>
        </TouchableOpacity>
      )}
      {viewMode === "earthquakes" && (
        <TouchableOpacity
          onPress={() => setEarthquakeScope(earthquakeScope === "regional" ? "sri-lanka" : "regional")}
          className="mt-3 self-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5"
        >
          <Text className="text-xs font-medium text-orange-700">
            {earthquakeScope === "regional" ? "Show Sri Lanka only" : "Show regional earthquakes"}
          </Text>
        </TouchableOpacity>
      )}

      <View className="mt-3 flex-row flex-wrap" style={{ gap: 10 }}>
        {legendFor(viewMode).map(([label, color]) => (
          <View key={label} className="flex-row items-center" style={{ gap: 4 }}>
            <ColorDot color={color} size={10} />
            <Text className="text-xs capitalize text-gray-600">{label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={{ height: 420, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <View className="mt-3" style={{ height: 420, borderRadius: 12, overflow: "hidden" }}>
          <MapView ref={mapRef} provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={SRI_LANKA_REGION}>
            {/* Deliberately no <Callout> anywhere here — react-native-maps'
                native Callout on Android renders its JS content into a
                fixed-size bitmap snapshot, and that snapshot's dimensions are
                taken before variable-height content (wrapped text,
                conditional lines) settles, so tapping a marker could still
                show clipped/garbled text even with an explicit width (tried
                and confirmed insufficient — see CLAUDE.md). Marker.onPress +
                a plain React-rendered detail card below the map sidesteps
                the native snapshot path entirely, since it's just normal
                React Native UI, not something the map view itself snapshots.

                Custom-View markers (a JSX child, as this used to be) have a
                long-standing, unfixed Android bug: `anchor` isn't reliably
                honored, because Android snapshots the JS-rendered child into
                a bitmap and can compute the anchor offset against the wrong
                measured size — confirmed for real on a device in this
                project (a river gauge's coordinate reverse-geocoded to the
                exact correct street, yet the marker rendered visibly out in
                the ocean), even after both `anchor` and `flat` were already
                set correctly. Fixed by switching every marker below to an
                `image` (see markerDots.ts) instead of a `<ColorDot>` child —
                Android gets a real bitmap with known pixel dimensions up
                front, sidestepping the snapshot-timing ambiguity entirely.
                `anchor={{x:0.5,y:0.5}}` is still needed (an image marker's
                own default anchor is also {0.5,1}, bottom-center — the
                right default for a pin, wrong for a plain dot). */}
            {viewMode === "requests" &&
              requests
                .filter((r) => r.location)
                .map((r) => (
                  <Marker
                    key={r.id}
                    coordinate={{ latitude: r.location!.lat, longitude: r.location!.lng }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    image={dotImage(SEVERITY_COLOR[r.severity] || "#6b7280")}
                    onPress={() =>
                      setSelected({
                        title: r.victimName,
                        lines: [
                          `${r.disasterType} · ${r.severity} severity`,
                          `Priority ${r.priorityScore?.toFixed(0)} · ${r.status}`,
                        ],
                      })
                    }
                  />
                ))}
            {viewMode === "requests" &&
              donations
                .filter((d) => d.location)
                .map((d) => (
                  <Marker
                    key={d.id}
                    coordinate={{ latitude: d.location!.lat, longitude: d.location!.lng }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    image={dotImage(DONATION_COLOR, 12)}
                    onPress={() => setSelected({ title: d.donorName, lines: [`${d.category} · ${d.status}`] })}
                  />
                ))}
            {viewMode === "areas" &&
              areas.map((a) => (
                <Marker
                  key={a.district}
                  coordinate={{ latitude: a.lat, longitude: a.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(LEVEL_COLOR[a.level], Math.min(16 + a.requestCount * 2, 36))}
                  onPress={() =>
                    setSelected({ title: a.district, lines: [`${a.requestCount} active requests`, LEVEL_LABEL[a.level]] })
                  }
                />
              ))}
            {viewMode === "gauges" &&
              gauges.map((g) => (
                <Marker
                  key={g.station}
                  coordinate={{ latitude: g.lat, longitude: g.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(GAUGE_STATUS_COLOR[g.status])}
                  onPress={() =>
                    setSelected({
                      title: g.station,
                      lines: [g.basin, `Level: ${g.waterLevel ?? "—"} m`, GAUGE_STATUS_LABEL[g.status]],
                    })
                  }
                />
              ))}
            {viewMode === "reservoirs" &&
              reservoirs
                .filter((r) => r.lat != null && r.lng != null)
                .map((r) => {
                  const color = r.locationApproximate ? RESERVOIR_APPROX_COLOR : RESERVOIR_RISK_COLOR[r.riskLevel];
                  return (
                    <Marker
                      key={r.name}
                      coordinate={{ latitude: r.lat as number, longitude: r.lng as number }}
                      anchor={{ x: 0.5, y: 0.5 }}
                      image={dotImage(color, r.locationApproximate ? 12 : 16)}
                      onPress={() =>
                        setSelected({
                          title: `${r.name} (${r.size})`,
                          lines: [
                            r.district ? `→ ${r.district} district` : null,
                            `${r.effectiveStoragePercent != null ? `${r.effectiveStoragePercent}% capacity` : "Capacity unknown"}${
                              r.levelMsl != null ? ` · ${r.levelMsl} m MSL` : ""
                            }`,
                            RESERVOIR_RISK_LABEL[r.riskLevel],
                            r.locationApproximate ? "Approximate location — district centroid." : null,
                          ].filter((line): line is string => Boolean(line)),
                        })
                      }
                    />
                  );
                })}
            {viewMode === "gdacs" &&
              gdacsEvents
                .filter((e) => e.location)
                .map((e, i) => (
                  <Marker
                    key={e.eventId ?? i}
                    coordinate={{ latitude: e.location!.lat, longitude: e.location!.lng }}
                    anchor={{ x: 0.5, y: 0.5 }}
                    image={dotImage(GDACS_ALERT_COLOR[e.alertLevel || ""] || "#6b7280", 14)}
                    onPress={() =>
                      setSelected({
                        title: e.eventName || e.title,
                        lines: [e.severityText, `${e.alertLevel} alert`].filter((line): line is string => Boolean(line)),
                      })
                    }
                  />
                ))}
            {viewMode === "earthquakes" &&
              earthquakes.map((eq) => (
                <Marker
                  key={eq.id}
                  coordinate={{ latitude: eq.lat, longitude: eq.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(magnitudeColor(eq.magnitude), 14)}
                  onPress={() =>
                    setSelected({
                      title: `M ${eq.magnitude.toFixed(1)}`,
                      lines: [eq.place, new Date(eq.time).toLocaleString()],
                    })
                  }
                />
              ))}
            {viewMode === "floodRisk" && floodRiskGeojson && (
              <Geojson
                key={`flood-risk-${floodRisk.map((f) => `${f.district}:${f.riskLevel ?? "?"}`).join(",")}`}
                geojson={floodRiskGeojson as unknown as Parameters<typeof Geojson>[0]["geojson"]}
                strokeWidth={1.2}
                tappable
                onPress={(event) => {
                  // Same known type-system gap as CountryFeature elsewhere in
                  // this app: <Geojson>'s onPress event type comes from the
                  // strict `geojson` npm package (properties: {...} | null),
                  // which our looser DistrictBoundaryFeature shape isn't
                  // structurally assignable to — the runtime shape is
                  // already verified correct, so this cast reflects a real
                  // type-system gap, not an actual runtime risk.
                  const feature = event.feature as unknown as DistrictBoundaryFeature | undefined;
                  const district = feature?.properties?.district;
                  const match = floodRisk.find((f) => f.district === district && !f.error);
                  if (!match) return; // no real data for this district — no popup rather than a misleading one
                  setSelected({
                    title: match.district,
                    lines: [`${Math.round(match.probability * 100)}% this month`, FLOOD_RISK_LABEL[match.riskLevel]],
                  });
                }}
              />
            )}
            {viewMode === "floodRisk" &&
              !floodRiskGeojson &&
              // Fallback for while boundaries are still loading (or failed to
              // load) — the original dot-marker rendering, unchanged. Same
              // fail-soft shape as every other external feed here — a
              // district entry can be `{district, month, error: true}` with
              // no lat/lng/riskLevel when its live NASA POWER fetch failed.
              // Filtered out before reaching a native Marker, same as every
              // other tab's marker list already does.
              floodRisk
                .filter((f) => !f.error)
                .map((f) => (
                <Marker
                  key={f.district}
                  coordinate={{ latitude: f.lat, longitude: f.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(FLOOD_RISK_COLOR[f.riskLevel], 18)}
                  onPress={() =>
                    setSelected({
                      title: f.district,
                      lines: [`${Math.round(f.probability * 100)}% this month`, FLOOD_RISK_LABEL[f.riskLevel]],
                    })
                  }
                />
              ))}
            {(viewMode === "gdacs" || viewMode === "earthquakes") && selectedCountry && (
              // Violet — deliberately a color no risk/alert-level palette on
              // this map already uses (green/amber/orange/red are all taken),
              // so a searched country's highlight is never mistaken for a
              // hazard-severity indicator. Matches web's identical choice.
              <Geojson
                // CountryFeature is a loosely-typed mirror of the real
                // GeoJSON this app's own /api/external/world-countries
                // returns (verified shape, see CountrySearchBox.tsx) — the
                // `geojson` npm package's stricter Feature<Geometry> types
                // don't line up 1:1 with it, hence the cast.
                geojson={{ type: "FeatureCollection", features: [selectedCountry] } as unknown as Parameters<typeof Geojson>[0]["geojson"]}
                strokeColor="#7c3aed"
                fillColor="rgba(124, 58, 237, 0.08)"
                strokeWidth={2}
                lineDashPattern={[6, 4]}
              />
            )}
          </MapView>
          {selected && (
            <View
              style={{
                position: "absolute",
                left: 8,
                right: 8,
                bottom: 8,
                backgroundColor: "white",
                borderRadius: 10,
                padding: 12,
                elevation: 4,
                shadowColor: "#000",
                shadowOpacity: 0.15,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}
                accessibilityLiveRegion="polite"
              >
                <Text style={{ flex: 1, marginRight: 8, fontWeight: "600", fontSize: 13 }}>{selected.title}</Text>
                <TouchableOpacity
                  onPress={() => setSelected(null)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close details"
                >
                  <Text style={{ color: "#6b7280", fontSize: 14 }}>✕</Text>
                </TouchableOpacity>
              </View>
              {selected.lines.map((line, i) => (
                <Text key={i} style={{ marginTop: 2, fontSize: 12, color: "#374151" }}>
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      {viewMode === "gdacs" && gdacsEvents.length === 0 && <Text className="mt-3 text-sm text-gray-500">No active events</Text>}
      {viewMode === "earthquakes" && earthquakes.length === 0 && (
        <Text className="mt-3 text-sm text-gray-500">No active events</Text>
      )}

      {viewMode === "reservoirs" &&
        (() => {
          const irrigation = reservoirs.filter((r) => r.source === "irrigation_department");
          const flagged = irrigation.filter((r) => r.riskLevel !== "normal");
          const visibleIrrigation = showAllReservoirs ? irrigation : flagged;
          const hydro = reservoirs.filter((r) => r.source === "ceb_mahaweli");
          return (
            <View className="mt-6 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <Text className="text-sm font-semibold text-gray-900">Reservoir Storage Levels</Text>

              <View className="mt-4">
                <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Irrigation Department Major & Medium Reservoirs
                </Text>
                <Text className="mt-1 text-xs text-gray-400">
                  Daily storage % and spilling status for {irrigation.length} irrigation reservoirs, from the
                  Irrigation Department's own published bulletin.
                </Text>
                <TouchableOpacity
                  onPress={() => setShowIrrigationReservoirs((v) => !v)}
                  accessibilityRole="button"
                  className="mt-2 flex-row items-center"
                  style={{ gap: 4 }}
                >
                  <Ionicons name={showIrrigationReservoirs ? "chevron-up" : "chevron-down"} size={12} color="#c2410c" />
                  <Text className="text-xs font-medium text-orange-700">
                    {showIrrigationReservoirs ? "Hide reservoirs" : "View reservoirs"}
                  </Text>
                </TouchableOpacity>
                {showIrrigationReservoirs && (
                  <>
                    <TouchableOpacity
                      onPress={() => setShowAllReservoirs((v) => !v)}
                      accessibilityRole="button"
                      className="mt-2 flex-row items-center"
                      style={{ gap: 4 }}
                    >
                      <Ionicons name={showAllReservoirs ? "chevron-up" : "chevron-down"} size={12} color="#c2410c" />
                      <Text className="text-xs font-medium text-orange-700">
                        {showAllReservoirs
                          ? "Show less (elevated/near-capacity/spilling only)"
                          : `Show all ${irrigation.length} reservoirs`}
                      </Text>
                    </TouchableOpacity>
                    {visibleIrrigation.length === 0 ? (
                      <Text className="mt-2 text-sm text-gray-500">
                        {flagged.length === 0 ? "No reservoirs currently at elevated storage." : "No reservoirs to show."}
                      </Text>
                    ) : (
                      <View className="mt-2" style={{ gap: 8 }}>
                        {visibleIrrigation.map((r) => (
                          <ReservoirCard key={r.name} r={r} />
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>

              <View className="mt-6">
                <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Hydropower & Mahaweli Reservoirs
                </Text>
                {hydro.length === 0 ? (
                  <Text className="mt-2 text-sm text-gray-500">Hydropower reservoir data is temporarily unavailable.</Text>
                ) : (
                  <View className="mt-2" style={{ gap: 8 }}>
                    {hydro.map((r) => (
                      <ReservoirCard key={r.name} r={r} />
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })()}
    </ScrollView>
  );
}
