import { View, ScrollView, Text } from "react-native";
import { AreaSeverityMap } from "../../components/AreaSeverityMap";

// Shared across victim/donor/volunteer tabs — the mobile equivalent of
// web's public /severity-map (district-aggregated data only, never a
// per-victim pin; see AreaSeverityMap.tsx for why).
export function SeverityMapScreen() {
  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Severity Map</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Where aid requests are concentrated right now, by district.
      </Text>
      <View className="mt-4">
        <AreaSeverityMap height={480} />
      </View>
    </ScrollView>
  );
}
