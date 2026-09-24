import { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, FlatList } from "react-native";
import { DISTRICTS } from "../lib/districts";

export interface DistrictOption {
  name: string;
  lat: number;
  lng: number;
}

/**
 * Mobile port of web's DistrictSearchBox.tsx — search-and-zoom for Sri
 * Lanka's 25 districts, no API fetch needed since DISTRICTS is a small
 * static list. Kept separate from CountrySearchBox.tsx for the same reason
 * as web: a district only ever needs a name + centroid (zoom-to-point),
 * while a country needs a full GeoJSON feature (zoom-to-bounds).
 */
export function DistrictSearchBox({
  onSelect,
  onClear,
  selectedName,
}: {
  onSelect: (district: DistrictOption) => void;
  onClear: () => void;
  selectedName: string | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matches = query.trim()
    ? DISTRICTS.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
    : [];

  function handleSelect(district: DistrictOption) {
    onSelect(district);
    setQuery(district.name);
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
          placeholder="Search for a district..."
          accessibilityLabel="Search for a district"
          className="flex-1 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
        />
        {selectedName && (
          <TouchableOpacity
            onPress={handleClear}
            accessibilityRole="button"
            accessibilityLabel="Clear district search"
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
            keyExtractor={(d) => d.name}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <TouchableOpacity onPress={() => handleSelect(item)} className="border-b border-gray-100 px-3 py-2">
                <Text className="text-sm text-gray-800">{item.name}</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}
