import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Ionicons } from "@expo/vector-icons";
import type { DonorTabParamList } from "./types";
import { RegisterDonationScreen } from "../screens/donor/RegisterDonationScreen";
import { MyDonationsScreen } from "../screens/donor/MyDonationsScreen";
import { SeverityMapScreen } from "../screens/shared/SeverityMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";
import { LogoutButton } from "../components/LogoutButton";

const Tab = createBottomTabNavigator<DonorTabParamList>();

function tabIcon(name: keyof typeof Ionicons.glyphMap, filledName: keyof typeof Ionicons.glyphMap) {
  return ({ color, size, focused }: { color: string; size: number; focused: boolean }) => (
    <Ionicons name={focused ? filledName : name} size={size} color={color} />
  );
}

export function DonorTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerRight: () => <LogoutButton />,
        tabBarActiveTintColor: "#ea580c",
        tabBarInactiveTintColor: "#64748b",
      }}
    >
      <Tab.Screen
        name="RegisterDonation"
        component={RegisterDonationScreen}
        options={{ title: "Donate", tabBarIcon: tabIcon("gift-outline", "gift") }}
      />
      <Tab.Screen
        name="MyDonations"
        component={MyDonationsScreen}
        options={{ title: "My Donations", tabBarIcon: tabIcon("receipt-outline", "receipt") }}
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
