import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, AccessibilityInfo } from "react-native";
import MapView, { Marker, Geojson, PROVIDER_GOOGLE } from "react-native-maps";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiFetch } from "../lib/api";
import { dotImage } from "../lib/markerDots";
import { DistrictSearchBox, type DistrictOption } from "./DistrictSearchBox";
import { CountrySearchBox, type CountryFeature } from "./CountrySearchBox";
import { regionForGeometry } from "../lib/geoBounds";

interface SelectedMarker {
  title: string;
  lines: string[];
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
  status: "normal" | "alert" | "minor_flood" | "major_flood";
}

interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  lat?: number | null;
  lng?: number | null;
  locationApproximate?: boolean;
  district: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
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
// web's AreaSeverityMap.tsx's identical DistrictBoundaryProps.
interface DistrictBoundaryFeature {
  type: "Feature";
  properties: { district: string; districtSi: string; districtTa: string; province: string; pcode: string; areaSqKm: number };
  geometry: { type: string; coordinates: unknown };
}
interface DistrictBoundaryCollection {
  type: "FeatureCollection";
  features: DistrictBoundaryFeature[];
}

// Same hex values as web's AreaSeverityMap.tsx/SituationMap.tsx — kept
// identical across every color map here so the map reads the same across
// platforms, not just for LEVEL_COLOR/GAUGE_STATUS_COLOR as before.
const LEVEL_COLOR: Record<string, string> = {
  high: "#dc2626",
  moderate: "#f59e0b",
  low: "#16a34a",
  none: "#9ca3af",
};
function levelLabel(t: TFunction): Record<string, string> {
  return {
    high: t("severityMap.highNeed"),
    moderate: t("severityMap.moderateNeed"),
    low: t("severityMap.lowNeed"),
    none: t("severityMap.noActivity"),
  };
}
const GAUGE_STATUS_COLOR: Record<string, string> = {
  major_flood: "#dc2626",
  minor_flood: "#f97316",
  alert: "#f59e0b",
  normal: "#2563eb",
};
function gaugeStatusLabel(t: TFunction): Record<string, string> {
  return {
    major_flood: t("severityMap.majorFlood"),
    minor_flood: t("severityMap.minorFlood"),
    alert: t("severityMap.alertLevel"),
    normal: t("severityMap.normal"),
  };
}
const RESERVOIR_RISK_COLOR: Record<string, string> = {
  normal: "#2563eb",
  elevated: "#f59e0b",
  high: "#f97316",
  spilling: "#dc2626",
};
// A reservoir with no real coordinates on file is shown at its district
// centroid instead — a distinct flat pink signals "approximate," never
// risk-graduated like the other colors here, so it never implies a
// precision the location itself doesn't have.
const RESERVOIR_APPROX_COLOR = "#f9a8d4";
function reservoirRiskLabel(t: TFunction): Record<string, string> {
  return {
    normal: t("severityMap.normal"),
    elevated: t("severityMap.reservoirElevated"),
    high: t("severityMap.reservoirNearCapacity"),
    spilling: t("severityMap.reservoirSpilling"),
  };
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
function floodRiskLabel(t: TFunction): Record<string, string> {
  return {
    low: t("severityMap.floodRiskLow"),
    moderate: t("severityMap.floodRiskModerate"),
    elevated: t("severityMap.floodRiskElevated"),
    high: t("severityMap.floodRiskHigh"),
  };
}

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

type ViewMode = "areas" | "gauges" | "reservoirs" | "gdacs" | "earthquakes" | "floodRisk";

// The 4 Sri-Lanka-focused tabs get district search; GDACS/Earthquakes (world
// data) get country search instead — same split web's AreaSeverityMap.tsx
// already uses.
const LOCAL_TABS = new Set<ViewMode>(["areas", "gauges", "reservoirs", "floodRisk"]);

function tabsFor(t: TFunction): { key: ViewMode; label: string }[] {
  return [
    { key: "areas", label: t("severityMap.areasAffected") },
    { key: "gauges", label: t("severityMap.riverLevels") },
    { key: "reservoirs", label: t("severityMap.reservoirsTab") },
    { key: "gdacs", label: t("severityMap.gdacsTab") },
    { key: "earthquakes", label: t("severityMap.earthquakesTab") },
    { key: "floodRisk", label: t("severityMap.floodRiskTab") },
  ];
}

function legendFor(viewMode: ViewMode, t: TFunction): [string, string][] {
  switch (viewMode) {
    case "areas":
      return Object.entries(levelLabel(t)).map(([k, label]) => [label, LEVEL_COLOR[k]]);
    case "gauges":
      return Object.entries(gaugeStatusLabel(t)).map(([k, label]) => [label, GAUGE_STATUS_COLOR[k]]);
    case "reservoirs":
      return [
        ...Object.entries(reservoirRiskLabel(t)).map(
          ([k, label]) => [`${label} ${t("severityMap.exactSuffix")}`, RESERVOIR_RISK_COLOR[k]] as [string, string]
        ),
        [t("severityMap.approximateLocationShort"), RESERVOIR_APPROX_COLOR],
      ];
    case "gdacs":
      return Object.entries(GDACS_ALERT_COLOR).map(([level, color]) => [
        t("severityMap.gdacsAlertLabel", { level }),
        color,
      ]);
    case "earthquakes":
      return EARTHQUAKE_LEGEND;
    case "floodRisk":
      return Object.entries(floodRiskLabel(t)).map(([k, label]) => [label, FLOOD_RISK_COLOR[k]]);
  }
}

// Public data only — district-aggregated request counts, river-gauge
// readings, reservoir risk, GDACS/earthquake hazard data, and the flood-risk
// forecast — never a per-victim pin. Mirrors web's AreaSeverityMap.tsx's
// full 6-tab set (minus the country/district search boxes and cyclone
// hazard polygons, desktop conveniences not worth rebuilding for a phone
// screen — plain markers + popups cover the same information).
export function AreaSeverityMap({ height = 420 }: { height?: number }) {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<ViewMode>("areas");
  const [selected, setSelected] = useState<SelectedMarker | null>(null);
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
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictOption | null>(null);
  const [selectedCountry, setSelectedCountry] = useState<CountryFeature | null>(null);

  useEffect(() => {
    apiFetch("/api/stats/by-area")
      .then(setAreas)
      .finally(() => setLoading(false));
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
  // risk tab reads district-by-district the same way web's already does —
  // direct user ask ("district wise colour coded... than dots"). Fetched
  // lazily on first opening this tab, same convention as every other tab's
  // own data — deliberately not fetched unconditionally on mount the way
  // web does (web needs it for both "areas" and "floodRisk"; mobile's
  // "areas" tab still uses count-scaled dots, out of scope for this ask).
  // The cold-cache fetch server-side can take a while (see external.js) —
  // fails soft to null, same as web, so this can only ever *improve* the
  // tab, never break it: the existing dot markers below stay as the
  // fallback for as long as boundaries hasn't loaded.
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
  // web's AreaSeverityMap.tsx already uses, rather than being colored as if
  // it had real "low risk" data.
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

  // react-native-maps' initialRegion only ever applies once, on first mount
  // — switching tabs alone doesn't move an already-created map. Recenter
  // imperatively instead (the RN equivalent of web's Leaflet
  // MapViewController), rather than binding the controlled `region` prop
  // continuously, which would fight the user's own pan/zoom on every render.
  useEffect(() => {
    if (LOCAL_TABS.has(viewMode) && selectedDistrict) {
      mapRef.current?.animateToRegion(
        { latitude: selectedDistrict.lat, longitude: selectedDistrict.lng, latitudeDelta: 0.9, longitudeDelta: 0.9 },
        400
      );
      return;
    }
    if ((viewMode === "gdacs" || viewMode === "earthquakes") && selectedCountry) {
      const region = regionForGeometry(selectedCountry.geometry);
      if (region) {
        mapRef.current?.animateToRegion(region, 400);
        return;
      }
    }
    const target = viewMode === "earthquakes" && earthquakeScope === "regional" ? REGIONAL_REGION : SRI_LANKA_REGION;
    mapRef.current?.animateToRegion(target, 400);
  }, [viewMode, earthquakeScope, selectedDistrict, selectedCountry]);

  // Marker taps are the primary way to get any detail out of this map, but
  // the resulting card is just a normal absolutely-positioned View, not a
  // Modal, so nothing tells a screen reader it appeared unless something
  // says so explicitly — accessibilityLiveRegion above only covers Android,
  // so this imperative announcement is what actually reaches both platforms.
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
    <View>
      <View className="mb-3 flex-row flex-wrap" style={{ gap: 8 }} accessibilityRole="tablist">
        {tabsFor(t).map((tab) => (
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
          className="mb-3 self-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5"
        >
          <Text className="text-xs font-medium text-orange-700">
            {gdacsScope === "global" ? t("severityMap.showSriLankaOnly") : t("severityMap.showGlobalAlerts")}
          </Text>
        </TouchableOpacity>
      )}
      {viewMode === "earthquakes" && (
        <TouchableOpacity
          onPress={() => setEarthquakeScope(earthquakeScope === "regional" ? "sri-lanka" : "regional")}
          className="mb-3 self-start rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5"
        >
          <Text className="text-xs font-medium text-orange-700">
            {earthquakeScope === "regional" ? t("severityMap.showSriLankaOnly") : t("severityMap.showRegionalEarthquakes")}
          </Text>
        </TouchableOpacity>
      )}

      <View className="mb-3 flex-row flex-wrap" style={{ gap: 12 }}>
        {legendFor(viewMode, t).map(([label, color]) => (
          <View key={label} className="flex-row items-center" style={{ gap: 4 }}>
            <ColorDot color={color} size={10} />
            <Text className="text-xs text-gray-600">{label}</Text>
          </View>
        ))}
      </View>
      {viewMode === "gauges" && (
        <Text className="mb-2 text-xs text-gray-400">{t("severityMap.unofficialData")}</Text>
      )}
      {viewMode === "reservoirs" && (
        <Text className="mb-2 text-xs text-gray-400">{t("severityMap.reservoirsMapCaption")}</Text>
      )}
      {viewMode === "floodRisk" && (
        <Text className="mb-2 text-xs text-gray-400">{t("severityMap.floodRiskCaption")}</Text>
      )}

      {loading ? (
        <View style={{ height, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
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
            {viewMode === "areas" &&
              areas.map((a) => (
                <Marker
                  key={a.district}
                  coordinate={{ latitude: a.lat, longitude: a.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(LEVEL_COLOR[a.level], Math.min(16 + a.requestCount * 2, 36))}
                  onPress={() =>
                    setSelected({
                      title: a.district,
                      lines: [t("severityMap.activeRequests", { count: a.requestCount }), levelLabel(t)[a.level]],
                    })
                  }
                />
              ))}
            {viewMode === "gauges" &&
              gauges.map((g) => (
                <Marker
                  key={g.station}
                  coordinate={{ latitude: g.lat, longitude: g.lng }}
                  anchor={{ x: 0.5, y: 0.5 }}
                  image={dotImage(GAUGE_STATUS_COLOR[g.status], 16)}
                  onPress={() =>
                    setSelected({
                      title: g.station,
                      lines: [g.basin, `${t("severityMap.level")}: ${g.waterLevel ?? "—"} m`, gaugeStatusLabel(t)[g.status]],
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
                            r.district ? t("severityMap.districtArrow", { district: r.district }) : null,
                            `${
                              r.effectiveStoragePercent != null
                                ? t("severityMap.capacityPercent", { pct: r.effectiveStoragePercent })
                                : t("severityMap.capacityUnknown")
                            }${r.levelMsl != null ? ` · ${r.levelMsl} m MSL` : ""}`,
                            reservoirRiskLabel(t)[r.riskLevel],
                            r.locationApproximate ? t("severityMap.approximateLocationLong") : null,
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
                        lines: [e.severityText, e.alertLevel ? t("severityMap.gdacsAlertLabel", { level: e.alertLevel }) : null].filter(
                          (line): line is string => Boolean(line)
                        ),
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
                  // structurally assignable to. The runtime shape is already
                  // verified correct (it's the same real API response web
                  // already consumes), so this cast reflects a real
                  // type-system gap, not an actual runtime risk.
                  const feature = event.feature as unknown as DistrictBoundaryFeature | undefined;
                  const district = feature?.properties?.district;
                  const match = floodRisk.find((f) => f.district === district && !f.error);
                  if (!match) return; // no real data for this district — same as web, no popup rather than a misleading one
                  setSelected({
                    title: match.district,
                    lines: [
                      t("severityMap.floodRiskThisMonth", { pct: Math.round(match.probability * 100) }),
                      floodRiskLabel(t)[match.riskLevel],
                    ],
                  });
                }}
              />
            )}
            {viewMode === "floodRisk" &&
              !floodRiskGeojson &&
              // Fallback for while boundaries are still loading (or failed to
              // load) — the original dot-marker rendering, unchanged. A
              // district can have a matching entry that FAILED to fetch
              // (`{district, month, error: true}`, no lat/lng/riskLevel —
              // see GET /api/external/flood-risk's per-district fail-soft
              // shape) — filtered out here the same way every other tab's
              // marker list already does, rather than handing an undefined
              // coordinate straight to a native Marker.
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
                      lines: [
                        t("severityMap.floodRiskThisMonth", { pct: Math.round(f.probability * 100) }),
                        floodRiskLabel(t)[f.riskLevel],
                      ],
                    })
                  }
                />
              ))}
            {(viewMode === "gdacs" || viewMode === "earthquakes") && selectedCountry && (
              // Violet — deliberately a color no risk/alert-level palette on
              // this map already uses, so a searched country's highlight is
              // never mistaken for a hazard-severity indicator. Matches
              // web's identical choice for the same reason.
              <Geojson
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

      {viewMode === "areas" && !loading && areas.length === 0 && (
        <Text className="mt-3 text-sm text-gray-500">{t("severityMap.noActiveRequests")}</Text>
      )}
      {viewMode === "gdacs" && gdacsEvents.length === 0 && (
        <Text className="mt-3 text-sm text-gray-500">{t("severityMap.gdacsNoEvents")}</Text>
      )}
      {viewMode === "earthquakes" && earthquakes.length === 0 && (
        <Text className="mt-3 text-sm text-gray-500">{t("severityMap.earthquakesNoEvents")}</Text>
      )}
    </View>
  );
}
