// Mobile equivalent of web/src/lib/notifications.ts. Different mechanism,
// same contract with the backend: register a push token via the existing
// POST /api/users/fcm-token endpoint, no server changes needed.
//
// Uses expo-notifications' getDevicePushTokenAsync() (the RAW native FCM
// registration token on Android) rather than an Expo push token — this is
// the same *kind* of token web already sends via the Firebase JS SDK's
// getToken(), so the backend's existing admin.messaging().sendEachForMulticast()
// call works unmodified. Requires this project's own google-services.json
// (not Expo's) to be present — see CLAUDE.md's "Push notifications" section
// for why, and what the user still needs to provide.
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiFetch } from "./api";

// Wrapped in try/catch, not just async rejection handling — this runs at
// module load time (the moment anything imports this file), so a throw here
// would crash app startup entirely for every user, including everyone still
// testing in Expo Go where this native module may not be fully present.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: false, // foreground messages get a custom in-app toast instead, matching web
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
} catch (err) {
  console.warn("Notifications.setNotificationHandler unavailable:", err);
}

export async function requestAndRegisterPushToken(): Promise<"granted" | "denied" | "unsupported"> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") return "unsupported";

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    const status = existing === "undetermined" ? (await Notifications.requestPermissionsAsync()).status : existing;
    if (status !== "granted") return "denied";

    const { data: token } = await Notifications.getDevicePushTokenAsync();
    if (token) {
      await apiFetch("/api/users/fcm-token", { method: "POST", body: JSON.stringify({ token }) });
    }
    return "granted";
  } catch (err) {
    // Expected in plain Expo Go (no remote push support there) as well as a
    // genuine registration failure — fails soft either way, never blocks login.
    console.warn("Failed to register push token:", err);
    return "unsupported";
  }
}

/** Subscribes to notifications received while the app is foregrounded. Returns an unsubscribe function. */
export function onForegroundMessage(callback: (title: string, body: string) => void): () => void {
  try {
    const subscription = Notifications.addNotificationReceivedListener((event) => {
      const { title, body } = event.request.content;
      if (title) callback(title, body || "");
    });
    return () => subscription.remove();
  } catch {
    return () => {};
  }
}
