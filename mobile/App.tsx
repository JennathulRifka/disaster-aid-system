// @ts-ignore — TS 6's "bundler" resolution doesn't resolve relative-path
// side-effect CSS imports even with an ambient "*.css" declaration (env.d.ts).
// Metro (NativeWind's plugin) handles this file at build time regardless.
import "./global.css";
import "./src/i18n";
import { StatusBar } from "expo-status-bar";
import { AuthProvider } from "./src/context/AuthContext";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
