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
import { Platform, Linking } from "react-native";
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
    // Always attempt the real native prompt unless already granted — not
    // just when "undetermined". Android still shows the in-app dialog again
    // after a first "deny" as long as the user hasn't checked "don't ask
    // again" (canAskAgain stays true); requestPermissionsAsync() itself is
    // safe to call even when the OS has permanently blocked it — it just
    // resolves with the still-denied status instead of showing anything, no
    // crash either way. This is what makes "tap Enable again" actually work
    // from inside the app instead of silently no-oping the first time it's
    // ever denied (see getNotificationPermissionState() below for detecting
    // the truly-locked-out case, which needs a Settings deep link instead).
    const status = existing === "granted" ? existing : (await Notifications.requestPermissionsAsync()).status;
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

/**
 * Whether a further in-app permission prompt is still possible, or the OS
 * has permanently blocked it (Android "don't ask again", or iOS which only
 * ever prompts once). When `canAskAgain` is false, requestAndRegisterPushToken()
 * will keep returning "denied" with no UI shown at all — the only remaining
 * path is the device's own notification settings screen, see
 * openNotificationSettings() below.
 */
export async function getNotificationPermissionState() {
  try {
    const { status, canAskAgain } = await Notifications.getPermissionsAsync();
    return { status, canAskAgain };
  } catch {
    return { status: Notifications.PermissionStatus.UNDETERMINED, canAskAgain: true };
  }
}

/**
 * One-tap deep link straight into this app's own notification settings
 * screen — the closest thing to "enable from the app itself" once the OS
 * has permanently blocked further in-app prompts. No app can force-grant a
 * permission the user has permanently denied; this at least skips the
 * "find Settings > Apps > Disaster Aid > Notifications yourself" hunt.
 */
export function openNotificationSettings() {
  Linking.openSettings().catch(() => {});
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
