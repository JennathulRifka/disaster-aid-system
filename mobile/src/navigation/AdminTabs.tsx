import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { AdminTabParamList } from "./types";
import { SosDispatchScreen } from "../screens/admin/SosDispatchScreen";
import { OverviewScreen } from "../screens/admin/OverviewScreen";
import { AidRequestsScreen } from "../screens/admin/AidRequestsScreen";
import { DonationsScreen } from "../screens/admin/DonationsScreen";
import { AdminMoreStack } from "./AdminMoreStack";
import { LogoutButton } from "../components/LogoutButton";

const Tab = createBottomTabNavigator<AdminTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

// SOS Dispatch deliberately listed first — the most time-sensitive queue in
// the app, matching web's nav ordering (see DashboardLayout.tsx NAV_BY_ROLE).
// "More" holds its own stack (AdminMoreStack) with its own per-screen
// headers, so it opts out of this navigator's shared headerRight/LogoutButton
// header — a nested header would double up otherwise.
export function AdminTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen
        name="SosDispatch"
        component={SosDispatchScreen}
        options={{ title: "SOS", tabBarIcon: tabIcon("warning-outline", "warning") }}
      />
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{ title: "Overview", tabBarIcon: tabIcon("stats-chart-outline", "stats-chart") }}
      />
      <Tab.Screen
        name="AidRequests"
        component={AidRequestsScreen}
        options={{ title: "Aid Requests", tabBarIcon: tabIcon("document-text-outline", "document-text") }}
      />
      <Tab.Screen
        name="Donations"
        component={DonationsScreen}
        options={{ title: "Donations", tabBarIcon: tabIcon("gift-outline", "gift") }}
      />
      <Tab.Screen
        name="More"
        component={AdminMoreStack}
        options={{ title: "More", headerShown: false, tabBarIcon: tabIcon("ellipsis-horizontal-outline", "ellipsis-horizontal") }}
      />
    </Tab.Navigator>
  );
}
