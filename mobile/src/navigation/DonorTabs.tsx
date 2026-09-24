import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { DonorTabParamList } from "./types";
import { DonorHomeScreen } from "../screens/donor/DonorHomeScreen";
import { RegisterDonationScreen } from "../screens/donor/RegisterDonationScreen";
import { MyDonationsScreen } from "../screens/donor/MyDonationsScreen";
import { DistrictNeedScreen } from "../screens/donor/DistrictNeedScreen";
import { NotificationsScreen } from "../screens/shared/NotificationsScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { MessagesStack } from "./MessagesStack";
import { LogoutButton } from "../components/LogoutButton";
import { useUnreadNotificationCount } from "../hooks/useUnreadNotificationCount";

const Tab = createBottomTabNavigator<DonorTabParamList>();

// Donate and My Donations are reachable via Home tiles only — direct user
// ask, same pattern already established for victim's SubmitRequest/
// MyRequests and volunteer's My Deliveries/Report Condition. Both
// tabBarButton and tabBarItemStyle are needed together (button-only leaves
// a visible blank gap — a real bug already hit and fixed once, see CLAUDE.md).
const HIDDEN_TAB_STYLE = { display: "none" as const };

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function DonorTabs() {
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
        component={DonorHomeScreen}
        options={{ title: "Home", tabBarIcon: tabIcon("home-outline", "home") }}
      />
      <Tab.Screen
        name="RegisterDonation"
        component={RegisterDonationScreen}
        options={{ title: "Donate", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="MyDonations"
        component={MyDonationsScreen}
        options={{ title: "My Donations", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
      />
      <Tab.Screen
        name="DistrictNeed"
        component={DistrictNeedScreen}
        options={{ title: "Areas Still In Need", tabBarButton: () => null, tabBarItemStyle: HIDDEN_TAB_STYLE }}
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
