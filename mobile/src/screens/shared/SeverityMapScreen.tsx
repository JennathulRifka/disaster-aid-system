import { useEffect, useState } from "react";
import { View, ScrollView, Text, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { AreaSeverityMap } from "../../components/AreaSeverityMap";
import { AccessibilityControls } from "../../components/AccessibilityControls";
import { MapWalkthroughModal } from "../../components/MapWalkthroughModal";
import { AppText } from "../../components/AppText";
import { useMapWalkthrough } from "../../hooks/useMapWalkthrough";
import { apiFetch } from "../../lib/api";

// Own, independent fetch — deliberately not sharing state with
// AreaSeverityMap's own internal reservoir-tab data, same "each surface
// manages its own copy" convention this project already uses for GDACS/
// earthquake scope toggles (see CLAUDE.md). This is the list-panel view of
// the same GET /api/external/reservoirs data the map's "Reservoirs" tab
// already plots as pins.
interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  source: "irrigation_department" | "ceb_mahaweli";
  district: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
  rainfallMm: number | null;
  date: string | null;
  riskLevel: "normal" | "elevated" | "high" | "spilling";
}

const RISK_LABEL_KEY: Record<string, string> = {
  elevated: "severityMap.reservoirElevated",
  high: "severityMap.reservoirNearCapacity",
  spilling: "severityMap.reservoirSpilling",
};
const RISK_BADGE_CLASS: Record<string, string> = {
  elevated: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  spilling: "bg-red-100 text-red-800",
};

// Shared between the Irrigation Department and CEB Mahaweli sub-lists,
// mirroring web's renderReservoirItem() — no badge at all when risk is
// "normal" (most reservoirs, most days), same as web's public list.
function ReservoirCard({ r, t }: { r: Reservoir; t: (key: string, opts?: Record<string, unknown>) => string }) {
  return (
    <View className="rounded border border-gray-200 bg-white p-3">
      <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
        {r.riskLevel !== "normal" && (
          <View className={`rounded-full px-2 py-0.5 ${RISK_BADGE_CLASS[r.riskLevel]}`}>
            <Text className="text-xs font-medium">{t(RISK_LABEL_KEY[r.riskLevel])}</Text>
          </View>
        )}
        <Text className="text-sm font-medium text-gray-900">{r.name}</Text>
        {r.district && <Text className="text-sm text-gray-500">— {r.district}</Text>}
      </View>
      <Text className="mt-1 text-sm text-gray-600">
        {r.effectiveStoragePercent != null
          ? t("severityMap.capacityPercent", { pct: r.effectiveStoragePercent })
          : t("severityMap.capacityUnknown")}
        {r.levelMsl != null ? ` · ${r.levelMsl} m MSL` : ""}
        {r.rainfallMm != null && r.rainfallMm > 0 ? ` · ${t("severityMap.reservoirRain", { mm: r.rainfallMm })}` : ""}
      </Text>
      {r.date && <Text className="mt-1 text-xs text-gray-400">{t("severityMap.reservoirAsOf", { date: r.date })}</Text>}
    </View>
  );
}

// Shared across victim/donor/volunteer tabs — the mobile equivalent of
// web's public /severity-map (district-aggregated data only, never a
// per-victim pin; see AreaSeverityMap.tsx for why).
export function SeverityMapScreen() {
  const { t } = useTranslation();
  const walkthrough = useMapWalkthrough();
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [showAllReservoirs, setShowAllReservoirs] = useState(false);

  useEffect(() => {
    apiFetch("/api/external/reservoirs")
      .then(setReservoirs)
      .catch(() => setReservoirs([]));
  }, []);

  const irrigation = reservoirs.filter((r) => r.source === "irrigation_department");
  const flaggedIrrigation = irrigation.filter((r) => r.riskLevel !== "normal");
  const visibleIrrigation = showAllReservoirs ? irrigation : flaggedIrrigation;
  const hydro = reservoirs.filter((r) => r.source === "ceb_mahaweli");

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <MapWalkthroughModal open={walkthrough.open} onClose={walkthrough.dismiss} />

      <View className="flex-row items-start justify-between">
        <View className="flex-1 pr-3">
          <AppText baseSize={24} className="font-semibold text-gray-900">
            {t("severityMap.title")}
          </AppText>
          <AppText baseSize={14} muted className="mt-1 text-gray-600">
            {t("severityMap.mobileSubtitle")}
          </AppText>
        </View>
        <AccessibilityControls onShowHelp={walkthrough.show} />
      </View>

      <View className="mt-4">
        <AreaSeverityMap height={480} />
      </View>

      <View className="mt-6">
        <AppText baseSize={14} className="font-semibold text-gray-900">
          {t("severityMap.reservoirsTitle")}
        </AppText>
        <AppText baseSize={12} muted className="mt-1 text-gray-400">
          {t("severityMap.reservoirsCaption")}
        </AppText>

        <View className="mt-4">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("severityMap.reservoirsIrrigationTitle")}
          </Text>
          <AppText baseSize={12} muted className="mt-1 text-gray-400">
            {t("severityMap.reservoirsIrrigationCaption")}
          </AppText>
          {irrigation.length > 0 && (
            <TouchableOpacity
              onPress={() => setShowAllReservoirs((v) => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: showAllReservoirs }}
              className="mt-2 flex-row items-center"
              style={{ gap: 6 }}
            >
              <View
                className={`h-4 w-4 items-center justify-center rounded border ${
                  showAllReservoirs ? "border-orange-600 bg-orange-600" : "border-gray-300 bg-white"
                }`}
              >
                {showAllReservoirs && <Text className="text-[10px] font-bold text-white">✓</Text>}
              </View>
              <Text className="text-xs text-gray-500">
                {t("severityMap.reservoirsShowAll", { count: irrigation.length })}
              </Text>
            </TouchableOpacity>
          )}
          {visibleIrrigation.length === 0 ? (
            <Text className="mt-2 text-sm text-gray-500">{t("severityMap.reservoirsNoFlagged")}</Text>
          ) : (
            <View className="mt-2" style={{ gap: 8 }}>
              {visibleIrrigation.map((r) => (
                <ReservoirCard key={r.name} r={r} t={t} />
              ))}
            </View>
          )}
        </View>

        <View className="mt-6">
          <Text className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            {t("severityMap.reservoirsHydroTitle")}
          </Text>
          <Text className="mt-1 text-xs text-gray-400">{t("severityMap.reservoirsHydroCaption")}</Text>
          {hydro.length === 0 ? (
            <Text className="mt-2 text-sm text-gray-500">{t("severityMap.reservoirsHydroUnavailable")}</Text>
          ) : (
            <View className="mt-2" style={{ gap: 8 }}>
              {hydro.map((r) => (
                <ReservoirCard key={r.name} r={r} t={t} />
              ))}
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}
