import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator } from "react-native";
import { apiFetch } from "../lib/api";

export interface CountryFeature {
  type: "Feature";
  properties: { name: string };
  geometry: { type: string; coordinates: unknown };
}

/**
 * Mobile port of web's CountrySearchBox.tsx — lets a person searching the
 * GDACS/Earthquakes tabs (which name countries like "Nepal" or "Indonesia")
 * find one on the map without already knowing where it is. Fetches the same
 * `GET /api/external/world-countries` GeoJSON web uses, lazily on first
 * mount (176 countries, ~280KB — small enough not to bother caching beyond
 * this component's own lifetime).
 */
export function CountrySearchBox({
  onSelect,
  onClear,
  selectedName,
}: {
  onSelect: (feature: CountryFeature) => void;
  onClear: () => void;
  selectedName: string | null;
}) {
  const [countries, setCountries] = useState<CountryFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    apiFetch("/api/external/world-countries")
      .then((data: { features?: CountryFeature[] }) => setCountries(data?.features || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const matches = query.trim()
    ? countries.filter((c) => c.properties.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  function handleSelect(feature: CountryFeature) {
    onSelect(feature);
    setQuery(feature.properties.name);
    setOpen(false);
  }

  function handleClear() {
    onClear();
    setQuery("");
    setOpen(false);
  }

  return (
    <View className="mt-3">
      <View className="flex-row items-center" style={{ gap: 8 }}>
        <TextInput
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for a country..."
          accessibilityLabel="Search for a country"
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
          editable={!loading}
        />
        {loading && <ActivityIndicator size="small" color="#6b7280" />}
        {selectedName && (
          <TouchableOpacity
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear country search"
            className="rounded border border-gray-300 bg-white px-2 py-1.5"
          >
            <Text className="text-xs text-gray-600">✕</Text>
          </TouchableOpacity>
        )}
      </View>
      {selectedName && (
        <Text className="mt-1 text-xs text-gray-500">
          Showing: <Text className="font-medium text-gray-700">{selectedName}</Text>
        </Text>
      )}
      {open && matches.length > 0 && (
        <View className="mt-1 max-h-48 overflow-hidden rounded border border-gray-200 bg-white">
          <FlatList
            data={matches}
            keyExtractor={(c) => c.properties.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleSelect(item)} className="border-b border-gray-100 px-3 py-2">
                <Text className="text-sm text-gray-800">{item.properties.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
