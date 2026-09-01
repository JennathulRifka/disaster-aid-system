import { View, ActivityIndicator } from "react-native";
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

// Mirrors DashboardLayout.tsx's NAV_BY_ROLE switch on the web app — one
// role-based tab navigator per role, swapped in once profile.role is known.
export function RootNavigator() {
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
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
