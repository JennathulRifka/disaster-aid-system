import { View, Text } from "react-native";

const COLORS: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-yellow-100", text: "text-yellow-800" },
  verified: { bg: "bg-blue-100", text: "text-blue-800" },
  rejected: { bg: "bg-red-100", text: "text-red-800" },
  matched: { bg: "bg-purple-100", text: "text-purple-800" },
  in_progress: { bg: "bg-purple-100", text: "text-purple-800" },
  delivered: { bg: "bg-green-100", text: "text-green-800" },
  available: { bg: "bg-blue-100", text: "text-blue-800" },
  pending_acceptance: { bg: "bg-yellow-100", text: "text-yellow-800" },
  accepted: { bg: "bg-blue-100", text: "text-blue-800" },
  picked_up: { bg: "bg-purple-100", text: "text-purple-800" },
  confirmed: { bg: "bg-green-100", text: "text-green-800" },
};

export function StatusBadge({ status }: { status: string }) {
  const colors = COLORS[status] || { bg: "bg-gray-100", text: "text-gray-800" };
  return (
    <View className={`rounded-full px-2.5 py-0.5 ${colors.bg}`}>
      <Text className={`text-xs font-medium capitalize ${colors.text}`}>{status.replace(/_/g, " ")}</Text>
    </View>
  );
}
