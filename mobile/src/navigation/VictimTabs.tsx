import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { VictimTabParamList } from "./types";
import { VictimHomeScreen } from "../screens/victim/VictimHomeScreen";
import { SubmitRequestScreen } from "../screens/victim/SubmitRequestScreen";
import { MyRequestsScreen } from "../screens/victim/MyRequestsScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { NotificationsScreen } from "../screens/shared/NotificationsScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { MessagesStack } from "./MessagesStack";
import { LogoutButton } from "../components/LogoutButton";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";

const Tab = createBottomTabNavigator<VictimTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

// A hidden tab still reserves a real, uncollapsed flex slot in this version
// of @react-navigation/bottom-tabs if only `tabBarButton` is overridden —
// that function replaces the inner touchable, but the OUTER wrapper (which
// gets `tabBarItemStyle`) still lays out at its normal width regardless of
// what the button renders. That's what left a visible gap in the tab bar
// between Home and Notifications. `display: "none"` on the wrapper itself
// is what actually removes it from layout.
const HIDDEN_TAB_STYLE = { display: "none" as const };

// User-requested trade: victims won't be submitting requests constantly once
// their initial need is registered, so "Submit Request"/"My Requests" moved
// off the always-visible tab bar and behind the Home screen's tiles instead
// — still fully reachable (navigation.navigate("SubmitRequest"/"MyRequests")
// from VictimHomeScreen.tsx keeps working unchanged), just not competing for
// one of the 5 tab slots any more. Notifications takes their place as an
// always-visible tab instead, on the reasoning that "what's happening with
// my request" is now surfaced via push/in-app notifications rather than
// requiring a trip to My Requests.
export function VictimTabs() {
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
        component={VictimHomeScreen}
        options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }}
      />
      <Tab.Screen
        name="SubmitRequest"
        component={SubmitRequestScreen}
        options={{ title: "Submit Request", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ title: "My Requests", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{
          title: "Notifications",
          // The red dot is a visual-only cue (the user deliberately wanted a
          // dot, not React Navigation's own numeric tabBarBadge — see
          // CLAUDE.md), so a screen reader would otherwise hear "Notifications"
          // with zero indication anything is unread. tabBarAccessibilityLabel
          // is React Navigation's own escape hatch for exactly this — it's
          // what actually gets announced, independent of what tabBarIcon renders.
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
