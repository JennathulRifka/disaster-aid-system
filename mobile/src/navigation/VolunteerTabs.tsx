import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { VolunteerTabParamList } from "./types";
import { VolunteerHomeScreen } from "../screens/volunteer/VolunteerHomeScreen";
import { MyDeliveriesScreen } from "../screens/volunteer/MyDeliveriesScreen";
import { VolunteerCommunityReportScreen } from "../screens/volunteer/VolunteerCommunityReportScreen";
import { NotificationsScreen } from "../screens/shared/NotificationsScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { MessagesStack } from "./MessagesStack";
import { LogoutButton } from "../components/LogoutButton";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";

const Tab = createBottomTabNavigator<VolunteerTabParamList>();

// My Deliveries and Report Condition are reachable via Home tiles only —
// direct user ask, same "don't need it always in the tab bar, a Home tile
// is enough" pattern already established for victim's SubmitRequest/
// MyRequests. tabBarButton alone only hides the inner touchable — the outer
// per-tab wrapper still lays out at full flex width without also setting
// tabBarItemStyle (a real bug already hit and fixed once for victim's
// tabs — see CLAUDE.md), so both are always set together.
const HIDDEN_TAB_STYLE = { display: "none" as const };

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function VolunteerTabs() {
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
        component={VolunteerHomeScreen}
        options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }}
      />
      <Tab.Screen
        name="MyDeliveries"
        component={MyDeliveriesScreen}
        options={{ title: "My Deliveries", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="CommunityReport"
        component={VolunteerCommunityReportScreen}
        options={{ title: "Report Condition", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
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
        name="SeverityMap"
        component={SeverityMapScreen}
        options={{ title: "Severity Map", tabBarIcon: tabIcon("map-outline", "map") }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesStack}
        options={{ title: "Messages", headerShown: false, tabBarIcon: tabIcon("chatbubble-outline", "chatbubble") }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", tabBarIcon: tabIcon("settings-outline", "settings") }}
      />
    </Tab.Navigator>
  );
}
