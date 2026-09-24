import { useEffect, useState } from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { useAuth } from "../context/AuthContext";
import { AuthNavigator } from "./AuthNavigator";
import { VictimTabs } from "./VictimTabs";
import { DonorTabs } from "./DonorTabs";
import { VolunteerTabs } from "./VolunteerTabs";
import { AdminTabs } from "./AdminTabs";
import { SosButton } from "../components/SosButton";
import { SosStatusBanner } from "../components/SosStatusBanner";
import { NotificationSetup } from "../components/NotificationSetup";
import { AppSplashScreen } from "../components/AppSplashScreen";

// Shown for at least this long on every cold start, regardless of how fast
// Firebase's auth-state check actually resolves — without a floor, a fast
// local network makes the splash flash for a single frame, which reads as a
// glitch rather than a deliberate branded loading screen.
const MIN_SPLASH_MS = 900;

// Mirrors DashboardLayout.tsx's NAV_BY_ROLE switch on the web app — one
// role-based tab navigator per role, swapped in once profile.role is known.
export function RootNavigator() {
  const { user, profile, loading } = useAuth();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(timer);
  }, []);

  if (loading || !minTimeElapsed) {
    return <AppSplashScreen />;
  }

  const loggedIn = Boolean(user && profile);

  return (
    <View style={{ flex: 1 }}>
      {loggedIn && <SosStatusBanner />}
      {loggedIn && <NotificationSetup />}

      <NavigationContainer>
        {!user || !profile ? (
          <AuthNavigator />
        ) : profile.role === "victim" ? (
          <VictimTabs />
        ) : profile.role === "donor" ? (
          <DonorTabs />
        ) : profile.role === "volunteer" ? (
          <VolunteerTabs />
        ) : (
          <AdminTabs />
        )}
      </NavigationContainer>

      {loggedIn && <SosButton />}
    </View>
  );
}
