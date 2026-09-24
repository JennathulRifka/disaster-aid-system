import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import * as Notifications from "expo-notifications";
import {
  requestAndRegisterPushToken,
  onForegroundMessage,
  getNotificationPermissionState,
  openNotificationSettings,
} from "../lib/notifications";

/**
 * Handles the whole push-notification lifecycle for a logged-in user:
 * silently (re-)registers the device's token if permission was already
 * granted in a previous session, offers a one-line opt-in prompt if
 * permission hasn't been decided yet, and shows a toast for messages that
 * arrive while the app is foregrounded (mirrors NotificationSetup.tsx on
 * web — same UX, different underlying push mechanism).
 */
export function NotificationSetup() {
  const [permission, setPermission] = useState<Notifications.PermissionStatus | "checking">("checking");
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  // Defensively caught everywhere below: this component is mounted for every
  // logged-in user unconditionally (see RootNavigator.tsx), so while the
  // custom dev build push notifications need is being set up, most testing
  // still happens in plain Expo Go — which doesn't support remote push at
  // all (see CLAUDE.md's "Push notifications" section). A thrown/rejected
  // call here must never crash every other already-working feature.
  useEffect(() => {
    getNotificationPermissionState().then(({ status, canAskAgain: askAgain }) => {
      setPermission(status);
      setCanAskAgain(askAgain);
    });
  }, []);

  useEffect(() => {
    if (permission === Notifications.PermissionStatus.GRANTED) {
      requestAndRegisterPushToken().catch(() => {});
    }
  }, [permission]);

  useEffect(() => {
    try {
      return onForegroundMessage((title, body) => {
        setToast({ title, body });
        setTimeout(() => setToast(null), 8000);
      });
    } catch {
      return undefined;
    }
  }, []);

  async function handleEnable() {
    const result = await requestAndRegisterPushToken().catch(() => "unsupported" as const);
    setPermission(
      result === "unsupported"
        ? Notifications.PermissionStatus.UNDETERMINED
        : result === "granted"
          ? Notifications.PermissionStatus.GRANTED
          : Notifications.PermissionStatus.DENIED
    );
    const { canAskAgain: askAgain } = await getNotificationPermissionState();
    setCanAskAgain(askAgain);
  }

  // Shown for "undetermined" (never asked yet) and for "denied" while the OS
  // will still show a real in-app prompt on retry (canAskAgain) — once the
  // OS has permanently blocked further prompts, the button below switches to
  // a direct Settings deep link instead of silently doing nothing on tap.
  const showBanner =
    !dismissed &&
    (permission === Notifications.PermissionStatus.UNDETERMINED ||
      (permission === Notifications.PermissionStatus.DENIED && canAskAgain));
  const showBlockedBanner = !dismissed && permission === Notifications.PermissionStatus.DENIED && !canAskAgain;

  return (
    <>
      {/* A floating card near the bottom, not a full-width bar at the very
          top of the screen — previously this rendered above even the tab
          navigator's own header, making a low-priority opt-in nudge the most
          visually prominent thing on screen, ahead of the page title itself.
          `zIndex` is required, not optional: this View is a sibling rendered
          BEFORE <NavigationContainer> in RootNavigator.tsx, and without an
          explicit zIndex the tab screen's own content (rendered after it,
          default zIndex 0) sits on top in React Native's hit-testing order —
          the card was visible (painted through a gap in the screen below)
          but every tap landed on the invisible screen content instead of the
          buttons. Bumped above the default 0 but kept below SosButton's own
          explicit zIndex:50, and pushed to bottom:150 (SosButton's own
          bottom:90/48px-tall default position spans roughly 90-138 from the
          screen bottom) so the two don't visually collide by default either —
          SosButton is draggable, so this only guarantees no overlap when it's
          sitting at its starting spot. */}
      {showBanner && (
        <View
          className="absolute left-4 right-4 rounded-xl border border-blue-100 bg-blue-50 p-3 shadow-lg"
          style={{ bottom: 150, elevation: 8, zIndex: 40 }}
        >
          <Text className="text-xs text-blue-900">
            Get notified the moment your request is approved or your delivery is on the way.
          </Text>
          <View className="mt-2 flex-row items-center justify-end" style={{ gap: 12 }}>
            <TouchableOpacity onPress={() => setDismissed(true)}>
              <Text className="text-xs text-blue-700 underline">Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleEnable} className="rounded bg-orange-600 px-3 py-1">
              <Text className="text-xs font-medium text-white">Enable</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {showBlockedBanner && (
        <View
          className="absolute left-4 right-4 rounded-xl border border-amber-100 bg-amber-50 p-3 shadow-lg"
          style={{ bottom: 150, elevation: 8, zIndex: 40 }}
        >
          <Text className="text-xs text-amber-900">Notifications are blocked for this app.</Text>
          <View className="mt-2 flex-row items-center justify-end" style={{ gap: 12 }}>
            <TouchableOpacity onPress={() => setDismissed(true)}>
              <Text className="text-xs text-amber-700 underline">Not now</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={openNotificationSettings} className="rounded bg-orange-600 px-3 py-1">
              <Text className="text-xs font-medium text-white">Open Settings</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {toast && (
        <View
          className="absolute right-4 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
          style={{ bottom: 90, elevation: 8, zIndex: 40 }}
        >
          <Text className="text-sm font-semibold text-gray-900">{toast.title}</Text>
          {toast.body ? <Text className="mt-1 text-sm text-gray-600">{toast.body}</Text> : null}
        </View>
      )}
    </>
  );
}
