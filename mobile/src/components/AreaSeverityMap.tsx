import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from "react-native-maps";
import { apiFetch } from "../lib/api";

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

// Same hex values as web's AreaSeverityMap.tsx (LEVEL_COLOR/GAUGE_STATUS_COLOR)
// — kept identical so the map reads the same across platforms.
const LEVEL_COLOR: Record<string, string> = {
  high: "#dc2626",
  moderate: "#f59e0b",
  low: "#16a34a",
  none: "#9ca3af",
};
const LEVEL_LABEL: Record<string, string> = {
  high: "High need",
  moderate: "Moderate need",
  low: "Low need",
  none: "No activity",
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

const SRI_LANKA_REGION = { latitude: 7.8731, longitude: 80.7718, latitudeDelta: 3.2, longitudeDelta: 3.2 };

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

type ViewMode = "areas" | "gauges";

// Public data only — district-aggregated request counts and river-gauge
// readings, never a per-victim pin. Mirrors web's AreaSeverityMap.tsx (minus
// the GDACS/earthquake extra layers, out of scope for this pass).
export function AreaSeverityMap({ height = 420 }: { height?: number }) {
  const [viewMode, setViewMode] = useState<ViewMode>("areas");
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [gauges, setGauges] = useState<GaugeStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [gaugesLoaded, setGaugesLoaded] = useState(false);

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

  return (
    <View>
      <View className="mb-3 flex-row" style={{ gap: 8 }}>
        <TouchableOpacity
          onPress={() => setViewMode("areas")}
          className={`rounded border px-3 py-1.5 ${viewMode === "areas" ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"}`}
        >
          <Text className={`text-xs font-medium ${viewMode === "areas" ? "text-white" : "text-gray-700"}`}>
            Areas Affected
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setViewMode("gauges")}
          className={`rounded border px-3 py-1.5 ${viewMode === "gauges" ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"}`}
        >
          <Text className={`text-xs font-medium ${viewMode === "gauges" ? "text-white" : "text-gray-700"}`}>
            River Levels
          </Text>
        </TouchableOpacity>
      </View>

      <View className="mb-3 flex-row flex-wrap" style={{ gap: 12 }}>
        {(viewMode === "areas" ? LEVEL_COLOR : GAUGE_STATUS_COLOR) &&
          Object.entries(viewMode === "areas" ? LEVEL_LABEL : GAUGE_STATUS_LABEL).map(([key, label]) => (
            <View key={key} className="flex-row items-center" style={{ gap: 4 }}>
              <ColorDot color={(viewMode === "areas" ? LEVEL_COLOR : GAUGE_STATUS_COLOR)[key]} size={10} />
              <Text className="text-xs text-gray-600">{label}</Text>
            </View>
          ))}
      </View>
      {viewMode === "gauges" && (
        <Text className="mb-2 text-xs text-gray-400">
          Live data from the Dept. of Irrigation's own public gauge network.
        </Text>
      )}

      {loading ? (
        <View style={{ height, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <View style={{ height, borderRadius: 12, overflow: "hidden" }}>
          <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={SRI_LANKA_REGION}>
            {viewMode === "areas" &&
              areas.map((a) => (
                <Marker key={a.district} coordinate={{ latitude: a.lat, longitude: a.lng }}>
                  <ColorDot color={LEVEL_COLOR[a.level]} size={Math.min(16 + a.requestCount * 2, 36)} />
                  <Callout>
                    <View style={{ padding: 4, minWidth: 140 }}>
                      <Text style={{ fontWeight: "600" }}>{a.district}</Text>
                      <Text style={{ fontSize: 12 }}>{a.requestCount} active requests</Text>
                      <Text style={{ fontSize: 12 }}>{LEVEL_LABEL[a.level]}</Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
            {viewMode === "gauges" &&
              gauges.map((g) => (
                <Marker key={g.station} coordinate={{ latitude: g.lat, longitude: g.lng }}>
                  <ColorDot color={GAUGE_STATUS_COLOR[g.status]} size={16} />
                  <Callout>
                    <View style={{ padding: 4, minWidth: 140 }}>
                      <Text style={{ fontWeight: "600" }}>{g.station}</Text>
                      <Text style={{ fontSize: 12 }}>{g.basin}</Text>
                      <Text style={{ fontSize: 12 }}>Level: {g.waterLevel ?? "—"} m</Text>
                      <Text style={{ fontSize: 12 }}>{GAUGE_STATUS_LABEL[g.status]}</Text>
                    </View>
                  </Callout>
                </Marker>
              ))}
          </MapView>
        </View>
      )}

      {viewMode === "areas" && !loading && areas.length === 0 && (
        <Text className="mt-3 text-sm text-gray-500">No active requests right now.</Text>
      )}
    </View>
  );
}
