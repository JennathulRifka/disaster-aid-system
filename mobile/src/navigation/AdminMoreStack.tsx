import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AdminMoreStackParamList } from "./types";
import { MoreScreen } from "../screens/admin/MoreScreen";
import { CategoriesScreen } from "../screens/admin/CategoriesScreen";
import { BroadcastScreen } from "../screens/admin/BroadcastScreen";
import { ActiveDistrictsScreen } from "../screens/admin/ActiveDistrictsScreen";
import { WaterAlertsScreen } from "../screens/admin/WaterAlertsScreen";
import { CommunityReportsScreen } from "../screens/admin/CommunityReportsScreen";
import { AuditLogScreen } from "../screens/admin/AuditLogScreen";
import { VolunteerWorkloadScreen } from "../screens/admin/VolunteerWorkloadScreen";
import { SituationMapScreen } from "../screens/admin/SituationMapScreen";
import { SettingsScreen } from "../screens/shared/SettingsScreen";

const Stack = createNativeStackNavigator<AdminMoreStackParamList>();

// A menu + stack, not more bottom tabs — 7 secondary admin screens would
// overcrowd a bottom tab bar. The 4 primary ones (SOS, Overview, Aid
// Requests, Donations) stay as tabs; everything else lives behind "More".
export function AdminMoreStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="MoreMenu" component={MoreScreen} options={{ title: "More" }} />
      <Stack.Screen name="Categories" component={CategoriesScreen} options={{ title: "Categories" }} />
      <Stack.Screen name="Broadcast" component={BroadcastScreen} options={{ title: "Broadcast" }} />
      <Stack.Screen name="ActiveDistricts" component={ActiveDistrictsScreen} options={{ title: "Active Emergencies" }} />
      <Stack.Screen name="WaterAlerts" component={WaterAlertsScreen} options={{ title: "Water Alerts" }} />
      <Stack.Screen name="CommunityReports" component={CommunityReportsScreen} options={{ title: "Community Reports" }} />
      <Stack.Screen name="AuditLog" component={AuditLogScreen} options={{ title: "Audit Log" }} />
      <Stack.Screen name="VolunteerWorkload" component={VolunteerWorkloadScreen} options={{ title: "Volunteer Workload" }} />
      <Stack.Screen name="SituationMap" component={SituationMapScreen} options={{ title: "Situation Map" }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
    </Stack.Navigator>
  );
}
