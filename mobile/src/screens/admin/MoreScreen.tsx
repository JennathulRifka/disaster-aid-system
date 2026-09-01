import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { AdminMoreStackParamList } from "../../navigation/types";

const ITEMS: { key: keyof AdminMoreStackParamList; label: string; desc: string }[] = [
  { key: "SituationMap", label: "Situation Map", desc: "Exact request/donation pins, areas affected, river gauges." },
  { key: "Categories", label: "Manage Categories", desc: "Edit request caps, add new aid categories." },
  { key: "Broadcast", label: "Broadcast Banner", desc: "Post or clear the emergency banner." },
  { key: "ActiveDistricts", label: "Active Emergencies", desc: "Mark districts as an active emergency." },
  { key: "WaterAlerts", label: "Water Level Alerts", desc: "Review or auto-send river gauge alerts." },
  { key: "CommunityReports", label: "Community Reports", desc: "Verify volunteer-submitted reports." },
  { key: "AuditLog", label: "Audit Log", desc: "Who did what, and when." },
  { key: "VolunteerWorkload", label: "Volunteer Workload", desc: "Deliveries per volunteer, busiest first." },
  { key: "Settings", label: "Settings", desc: "Edit your name/phone, language, and notifications." },
];

export function MoreScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AdminMoreStackParamList>>();

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">More</Text>
      <View className="mt-4" style={{ gap: 10 }}>
        {ITEMS.map((item) => (
          <TouchableOpacity
            key={item.key}
            onPress={() => navigation.navigate(item.key as any)}
            className="rounded-xl border border-gray-200 bg-white p-4"
          >
            <Text className="text-sm font-medium text-gray-900">{item.label}</Text>
            <Text className="mt-1 text-xs text-gray-500">{item.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}
