import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TextInput, TouchableOpacity } from "react-native";
import { useTranslation } from "react-i18next";
import { apiFetch } from "../../lib/api";

interface DistrictNeedRow {
  district: string;
  category: string;
  pendingCount: number;
  pendingQuantity: number;
}

// A donor's own client can't read other victims' aidRequests documents
// directly (Firestore rules correctly restrict that to the request's own
// victim or an admin), so unlike DistrictInventoryScreen.tsx this can't be a
// live onSnapshot view — it polls the public, aggregate-only
// GET /api/stats/district-need endpoint instead (see "Donation
// leftover-quantity tracking & district inventory" in CLAUDE.md). 30s
// refresh approximates "live" without needing to relax any privacy rule.
const REFRESH_MS = 30_000;

export function DistrictNeedScreen() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DistrictNeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch("/api/stats/district-need");
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Plain substring filter over the already-fetched rows — same reasoning
  // as web's DonorDistrictNeed.tsx: this is a list with no map, so a
  // type-to-filter text input is the natural fit, not the map-oriented
  // CountrySearchBox/DistrictSearchBox pattern used elsewhere on mobile.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.district.toLowerCase().includes(q));
  }, [rows, search]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("donorDistrictNeed.title")}</Text>
      <Text className="mt-1 text-sm text-gray-600">{t("donorDistrictNeed.subtitle")}</Text>

      <View className="mt-4 flex-row items-center rounded-lg border border-gray-300 bg-white px-3">
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t("donorDistrictNeed.searchPlaceholder")}
          accessibilityLabel={t("donorDistrictNeed.searchPlaceholder")}
          className="flex-1 py-2 text-sm text-gray-900"
        />
        {search.length > 0 && (
          <TouchableOpacity
            onPress={() => setSearch("")}
            accessibilityRole="button"
            accessibilityLabel={t("common.close")}
          >
            <Text className="text-gray-400">✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {filteredRows.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">
          {rows.length === 0 ? t("donorDistrictNeed.noNeed") : t("donorDistrictNeed.noMatch")}
        </Text>
      ) : (
        <View className="mt-4" style={{ gap: 10 }}>
          {filteredRows.map((row) => (
            <View key={`${row.district}::${row.category}`} className="rounded-xl border border-gray-200 bg-white p-4">
              <Text className="text-sm font-semibold text-gray-900">{row.district}</Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-xs capitalize text-gray-600">
                  {t(`categories.${row.category}`, { defaultValue: row.category })}
                </Text>
                <Text className="text-sm font-medium text-gray-900">{row.pendingQuantity}</Text>
              </View>
              <Text className="mt-1 text-xs text-gray-400">
                {row.pendingCount} {t("donorDistrictNeed.pendingRequests").toLowerCase()}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
