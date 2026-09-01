import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { VolunteerTabParamList } from "./types";
import { MyDeliveriesScreen } from "../screens/volunteer/MyDeliveriesScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { LogoutButton } from "../components/LogoutButton";

const Tab = createBottomTabNavigator<VolunteerTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function VolunteerTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen
        name="MyDeliveries"
        component={MyDeliveriesScreen}
        options={{ title: "My Deliveries", tabBarIcon: tabIcon("car-outline", "car") }}
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
