import { View, Text, ActivityIndicator } from "react-native";

// A plain JS/React splash screen, deliberately NOT the native expo-splash-screen
// module — that package needs its own native code linked into the app, which
// would mean yet another `eas build` before it works on the dev-client APK
// already installed (the same "native module not in the current build" trap
// already hit twice this session with react-native-maps and expo-notifications
// — see CLAUDE.md). This achieves the same practical effect (a branded screen
// shown while the app initializes) with zero native dependency, so it works
// immediately via Fast Refresh on the build already on the phone.
export function AppSplashScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-900">
      <Text className="text-3xl font-bold text-white">Disaster Aid</Text>
      <Text className="mt-1 text-sm text-slate-400">Sri Lanka</Text>
      <ActivityIndicator size="large" color="#ea580c" style={{ marginTop: 32 }} />
    </View>
  );
}
