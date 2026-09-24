import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { AdminTabParamList } from "./types";
import { AdminHomeScreen } from "../screens/admin/AdminHomeScreen";
import { SosDispatchScreen } from "../screens/admin/SosDispatchScreen";
import { OverviewScreen } from "../screens/admin/OverviewScreen";
import { AidRequestsScreen } from "../screens/admin/AidRequestsScreen";
import { DonationsScreen } from "../screens/admin/DonationsScreen";
import { CategoriesScreen } from "../screens/admin/CategoriesScreen";
import { BroadcastScreen } from "../screens/admin/BroadcastScreen";
import { ActiveDistrictsScreen } from "../screens/admin/ActiveDistrictsScreen";
import { WaterAlertsScreen } from "../screens/admin/WaterAlertsScreen";
import { CommunityReportsScreen } from "../screens/admin/CommunityReportsScreen";
import { AuditLogScreen } from "../screens/admin/AuditLogScreen";
import { VolunteerWorkloadScreen } from "../screens/admin/VolunteerWorkloadScreen";
import { DistrictInventoryScreen } from "../screens/admin/DistrictInventoryScreen";
import { SituationMapScreen } from "../screens/admin/SituationMapScreen";
import { NotificationsScreen } from "../screens/shared/NotificationsScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { LogoutButton } from "../components/LogoutButton";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";

const Tab = createBottomTabNavigator<AdminTabParamList>();

// Flattened from "4 tabs + a More menu listing 7 more screens" — direct
// user ask: don't bury the rest of the admin surface behind a menu, put it
// all as a Home tile instead (AdminHomeScreen.tsx), same pattern SOS
// Dispatch/Overview/etc. already used. Every screen below Settings in this
// file is a *hidden* tab (tabBarButton: () => null + tabBarItemStyle, the
// same two-prop pattern already needed for victim/donor/volunteer's hidden
// tabs — button-only leaves a visible blank gap, a real bug already hit
// and fixed once, see CLAUDE.md) reachable only via a Home tile press, not
// a nested stack — this is what lets a tile's onPress just be a plain
// `navigation.navigate(key)` with no stack to reach through.
const HIDDEN_TAB_STYLE = { display: "none" as const };

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function AdminTabs() {
  const unreadCount = useUnreadNotificationCount();

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen
        name="Home"
        component={AdminHomeScreen}
        options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }}
      />
      <Tab.Screen
        name="SosDispatch"
        component={SosDispatchScreen}
        options={{ title: "SOS", tabBarIcon: tabIcon("warning-outline", "warning") }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
          tabBarAccessibilityLabel: unreadCount > 0 ? `Notifications, ${unreadCount} unread` : "Notifications",
          tabBarIcon: ({ color, size, focused }) => (
            <View>
              <Ionicons name={focused ? "notifications" : "notifications-outline"} size={size} color={color} />
              {unreadCount > 0 && (
                <View
                  importantForAccessibility="no"
                  accessibilityElementsHidden
                  style={{
                    position: "absolute",
                    top: -1,
                    right: -4,
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: "#dc2626",
                    borderWidth: 1,
                    borderColor: "#fff",
                  }}
                />
              )}
            </View>
          ),
        }}
      />
      <Tab.Screen
        name="SituationMap"
        component={SituationMapScreen}
        options={{ title: "Situation Map", tabBarIcon: tabIcon("map-outline", "map") }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", tabBarIcon: tabIcon("settings-outline", "settings") }}
      />

      {/* Hidden — Home-tile only, see the note above. */}
      <Tab.Screen
        name="Overview"
        component={OverviewScreen}
        options={{ title: "Overview", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="AidRequests"
        component={AidRequestsScreen}
        options={{ title: "Aid Requests", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="Donations"
        component={DonationsScreen}
        options={{ title: "Donations", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="Categories"
        component={CategoriesScreen}
        options={{ title: "Categories", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="Broadcast"
        component={BroadcastScreen}
        options={{ title: "Broadcast", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="ActiveDistricts"
        component={ActiveDistrictsScreen}
        options={{ title: "Active Emergencies", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="WaterAlerts"
        component={WaterAlertsScreen}
        options={{ title: "Water Alerts", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="CommunityReports"
        component={CommunityReportsScreen}
        options={{ title: "Community Reports", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="AuditLog"
        component={AuditLogScreen}
        options={{ title: "Audit Log", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="VolunteerWorkload"
        component={VolunteerWorkloadScreen}
        options={{ title: "Volunteer Workload", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="DistrictInventory"
        component={DistrictInventoryScreen}
        options={{ title: "District Inventory", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
    </Tab.Navigator>
  );
}
