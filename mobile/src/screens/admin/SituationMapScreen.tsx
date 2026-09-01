import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from "react-native-maps";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";

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

type ViewMode = "requests" | "areas" | "gauges";

const TABS: { key: ViewMode; label: string }[] = [
  { key: "requests", label: "Requests" },
  { key: "areas", label: "Areas Affected" },
  { key: "gauges", label: "River Gauges" },
];

// Admin-only exact pinpoints (Requests tab) + the same public aggregate
// layers as the shared severity map (Areas/Gauges) — mirrors web's
// SituationMap.tsx, minus GDACS/earthquake tabs (out of scope for this pass).
export function SituationMapScreen() {
  const [viewMode, setViewMode] = useState<ViewMode>("requests");
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [areas, setAreas] = useState<AreaStat[]>([]);
  const [gauges, setGauges] = useState<GaugeStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [gaugesLoaded, setGaugesLoaded] = useState(false);

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

  const legendEntries =
    viewMode === "requests"
      ? [...Object.entries(SEVERITY_COLOR).map(([k, c]) => [`${k} request`, c] as const), ["Donation pickup", DONATION_COLOR] as const]
      : viewMode === "areas"
        ? Object.entries(LEVEL_LABEL).map(([k, label]) => [label, LEVEL_COLOR[k]] as const)
        : Object.entries(GAUGE_STATUS_LABEL).map(([k, label]) => [label, GAUGE_STATUS_COLOR[k]] as const);

  return (
    <View className="flex-1 bg-gray-50 p-4">
      <Text className="text-2xl font-semibold text-gray-900">Situation Map</Text>

      <View className="mt-3 flex-row" style={{ gap: 8 }}>
        {TABS.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            onPress={() => setViewMode(tab.key)}
            className={`rounded border px-3 py-1.5 ${viewMode === tab.key ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"}`}
          >
            <Text className={`text-xs font-medium ${viewMode === tab.key ? "text-white" : "text-gray-700"}`}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View className="mt-3 flex-row flex-wrap" style={{ gap: 10 }}>
        {legendEntries.map(([label, color]) => (
          <View key={label} className="flex-row items-center" style={{ gap: 4 }}>
            <ColorDot color={color} size={10} />
            <Text className="text-xs capitalize text-gray-600">{label}</Text>
          </View>
        ))}
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator size="large" color="#ea580c" />
        </View>
      ) : (
        <View className="mt-3 flex-1" style={{ borderRadius: 12, overflow: "hidden" }}>
          <MapView provider={PROVIDER_GOOGLE} style={{ flex: 1 }} initialRegion={SRI_LANKA_REGION}>
            {viewMode === "requests" &&
              requests
                .filter((r) => r.location)
                .map((r) => (
                  <Marker key={r.id} coordinate={{ latitude: r.location!.lat, longitude: r.location!.lng }}>
                    <ColorDot color={SEVERITY_COLOR[r.severity] || "#6b7280"} />
                    <Callout>
                      <View style={{ padding: 4, minWidth: 160 }}>
                        <Text style={{ fontWeight: "600" }}>{r.victimName}</Text>
                        <Text style={{ fontSize: 12 }}>
                          {r.disasterType} · {r.severity} severity
                        </Text>
                        <Text style={{ fontSize: 12 }}>
                          Priority {r.priorityScore?.toFixed(0)} · {r.status}
                        </Text>
                      </View>
                    </Callout>
                  </Marker>
                ))}
            {viewMode === "requests" &&
              donations
                .filter((d) => d.location)
                .map((d) => (
                  <Marker key={d.id} coordinate={{ latitude: d.location!.lat, longitude: d.location!.lng }}>
                    <ColorDot color={DONATION_COLOR} size={12} />
                    <Callout>
                      <View style={{ padding: 4, minWidth: 140 }}>
                        <Text style={{ fontWeight: "600" }}>{d.donorName}</Text>
                        <Text style={{ fontSize: 12 }}>
                          {d.category} · {d.status}
                        </Text>
                      </View>
                    </Callout>
                  </Marker>
                ))}
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
                  <ColorDot color={GAUGE_STATUS_COLOR[g.status]} />
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
    </View>
  );
}
