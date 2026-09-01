import { View, Text } from "react-native";

// Placeholder for screens not yet built on mobile — swapped for a real
// screen as each role's flow gets built out (see CLAUDE.md "Mobile app").
export function ComingSoon({ label }: { label: string }) {
  return (
    <View className="flex-1 items-center justify-center bg-white px-8">
      <Text className="text-lg font-semibold text-slate-900">{label}</Text>
      <Text className="mt-2 text-center text-sm text-gray-500">
        This screen isn't built yet — available on the web app for now.
      </Text>
    </View>
  );
}
