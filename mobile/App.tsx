// @ts-ignore — TS 6's "bundler" resolution doesn't resolve relative-path
// side-effect CSS imports even with an ambient "*.css" declaration (env.d.ts).
// Metro (NativeWind's plugin) handles this file at build time regardless.
import "./global.css";
import "./src/i18n";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

// SafeAreaProvider is required for useSafeAreaInsets() to work anywhere in
// the tree (SosStatusBanner.tsx needs it — that banner renders as a plain
// View above NavigationContainer, so without an explicit safe-area inset it
// collides with the status bar/notch instead of sitting below it).
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
        <StatusBar style="auto" />
      </AuthProvider>
    </SafeAreaProvider>
  );
}
