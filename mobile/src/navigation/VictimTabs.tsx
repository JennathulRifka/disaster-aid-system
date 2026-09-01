import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { VictimTabParamList } from "./types";
import { SubmitRequestScreen } from "../screens/victim/SubmitRequestScreen";
import { MyRequestsScreen } from "../screens/victim/MyRequestsScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { LogoutButton } from "../components/LogoutButton";

const Tab = createBottomTabNavigator<VictimTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function VictimTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen
        name="SubmitRequest"
        component={SubmitRequestScreen}
        options={{ title: "Submit Request", tabBarIcon: tabIcon("add-circle-outline", "add-circle") }}
      />
      <Tab.Screen
        name="MyRequests"
        component={MyRequestsScreen}
        options={{ title: "My Requests", tabBarIcon: tabIcon("document-text-outline", "document-text") }}
      />
      <Tab.Screen
        name="SeverityMap"
        component={SeverityMapScreen}
        options={{ title: "Severity Map", tabBarIcon: tabIcon("map-outline", "map") }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: "Settings", tabBarIcon: tabIcon("settings-outline", "settings") }}
      />
    </Tab.Navigator>
  );
}
