import { View, Text } from "react-native";

export function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <View className="w-[47%] rounded-xl border border-gray-200 bg-white p-4">
      <Text className="text-xs text-gray-500">{label}</Text>
      <Text className="mt-1 text-2xl font-semibold text-gray-900">{value}</Text>
    </View>
  );
}
