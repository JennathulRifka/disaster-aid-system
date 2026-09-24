import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export interface HomeTile {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  iconColor: string;
  onPress: () => void;
  // Shows a small red dot on the tile's icon — e.g. "there are new pending
  // aid requests you haven't reviewed yet." Purely a boolean presence flag,
  // matching the tab-bar unread-notification dot elsewhere in this app
  // (a dot, not a count) for a consistent visual vocabulary.
  badge?: boolean;
}

// The shared landing screen for every role — a grid of large, rounded,
// light-tinted tiles (two per row, wrapping to more rows as needed) that
// jump straight into that role's own tabs. Replaces "log in and land
// straight on a form/table with no orientation" — see the per-role
// Home screens (VictimHomeScreen.tsx etc.) for what each role's grid
// actually contains.
export function HomeTileGrid({ title, subtitle, tiles }: { title: string; subtitle?: string; tiles: HomeTile[] }) {
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 20 }}>
      <Text className="text-2xl font-bold text-gray-900">{title}</Text>
      {subtitle && <Text className="mt-1 text-sm text-gray-500">{subtitle}</Text>}

      <View className="mt-6 flex-row flex-wrap justify-between">
        {tiles.map((tile) => (
          <TouchableOpacity
            key={tile.label}
            onPress={tile.onPress}
            activeOpacity={0.7}
            className="mb-4 items-center justify-center rounded-3xl px-3 py-6"
            style={{ width: "48%", aspectRatio: 1, backgroundColor: tile.color }}
          >
            <View>
              <Ionicons name={tile.icon} size={34} color={tile.iconColor} />
              {tile.badge && (
                <View
                  importantForAccessibility="no"
                  accessibilityElementsHidden
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -6,
                    width: 11,
                    height: 11,
                    borderRadius: 6,
                    backgroundColor: "#dc2626",
                    borderWidth: 1.5,
                    borderColor: "#fff",
                  }}
                />
              )}
            </View>
            <Text className="mt-3 text-center text-sm font-semibold text-gray-800">
              {tile.label}
              {tile.badge ? " •" : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
