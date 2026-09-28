import type { NavigatorScreenParams } from "@react-navigation/native";

export type AuthStackParamList = {
  Home: undefined;
  Login: undefined;
  Register: undefined;
};

// Nested inside each role's "Messages" tab below — a chat list plus the
// thread screen. Declaring the tab's "Messages" field as
// NavigatorScreenParams<MessagesStackParamList> (not `undefined`) is what
// lets a per-item 💬 button elsewhere (e.g. MyRequestsScreen) push straight
// into a specific chat via
// navigation.navigate("Messages", { screen: "ChatThread", params: { chatId } })
// with full type safety, rather than just switching tabs.
export type MessagesStackParamList = {
  ChatList: undefined;
  ChatThread: { chatId: string };
};

// Every role's tab list starts with "Home" — a tile-grid landing screen
// (see HomeTileGrid.tsx) so logging in never drops a user straight into a
// form or a live data table with no orientation. Home is the initial tab
// (see each Tabs.tsx's `initialRouteName`), the other tabs are unchanged.
export type VictimTabParamList = {
  Home: undefined;
  SubmitRequest: undefined;
  MyRequests: undefined;
  Notifications: undefined;
  SeverityMap: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Settings: undefined;
};

export type DonorTabParamList = {
  Home: undefined;
  RegisterDonation: undefined;
  MyDonations: undefined;
  DistrictNeed: undefined;
  Notifications: undefined;
  SeverityMap: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Settings: undefined;
};

export type VolunteerTabParamList = {
  Home: undefined;
  MyDeliveries: undefined;
  CommunityReport: undefined;
  // Reached from a delivery card's "Navigate" button, not a Home tile — a
  // hidden tab (same convention as MyDeliveries/CommunityReport) carrying
  // which delivery to route to/from.
  VolunteerNavigation: { deliveryId: string };
  Notifications: undefined;
  SeverityMap: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  Settings: undefined;
};

// Flattened from an earlier "4 tabs + a More stack listing 7 more screens"
// layout — direct user ask: don't bury the rest of the admin surface behind
// a menu screen, put everything as a Home tile instead, the same pattern
// SOS Dispatch/Overview/etc. already used. SosDispatch/Notifications/
// SituationMap/Settings are real, always-visible bottom tabs; every other
// entry here is a *hidden* tab (tabBarButton: () => null, same convention
// already used for victim's SubmitRequest/MyRequests) reachable only via a
// Home tile — this keeps them all real screens in this one navigator
// (so a Home-tile press is a plain `navigation.navigate(key)`, no nested
// stack to reach through) without cluttering the tab bar itself.
export type AdminTabParamList = {
  Home: undefined;
  SosDispatch: undefined;
  Notifications: undefined;
  Messages: NavigatorScreenParams<MessagesStackParamList>;
  SituationMap: undefined;
  Settings: undefined;
  Overview: undefined;
  AidRequests: undefined;
  Donations: undefined;
  Categories: undefined;
  Broadcast: undefined;
  ActiveDistricts: undefined;
  WaterAlerts: undefined;
  CommunityReports: undefined;
  AuditLog: undefined;
  VolunteerWorkload: undefined;
  DistrictInventory: undefined;
};
