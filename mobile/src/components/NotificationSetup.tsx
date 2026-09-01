import { useEffect, useState } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import * as Notifications from "expo-notifications";
import { requestAndRegisterPushToken, onForegroundMessage } from "../lib/notifications";

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
  const [dismissed, setDismissed] = useState(false);
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  // Defensively caught everywhere below: this component is mounted for every
  // logged-in user unconditionally (see RootNavigator.tsx), so while the
  // custom dev build push notifications need is being set up, most testing
  // still happens in plain Expo Go — which doesn't support remote push at
  // all (see CLAUDE.md's "Push notifications" section). A thrown/rejected
  // call here must never crash every other already-working feature.
  useEffect(() => {
    Notifications.getPermissionsAsync()
      .then(({ status }) => setPermission(status))
      .catch(() => setPermission(Notifications.PermissionStatus.UNDETERMINED));
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
  }

  return (
    <>
      {permission === Notifications.PermissionStatus.UNDETERMINED && !dismissed && (
        <View className="flex-row items-center justify-between border-b border-blue-100 bg-blue-50 px-4 py-2">
          <Text className="flex-1 pr-2 text-xs text-blue-900">
            Get notified the moment your request is approved or your delivery is on the way.
          </Text>
          <View className="flex-row items-center" style={{ gap: 12 }}>
            <TouchableOpacity onPress={handleEnable} className="rounded bg-orange-600 px-3 py-1">
              <Text className="text-xs font-medium text-white">Enable</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setDismissed(true)}>
              <Text className="text-xs text-blue-700 underline">Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {toast && (
        <View
          className="absolute right-4 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-lg"
          style={{ bottom: 90, elevation: 8 }}
        >
          <Text className="text-sm font-semibold text-gray-900">{toast.title}</Text>
          {toast.body ? <Text className="mt-1 text-sm text-gray-600">{toast.body}</Text> : null}
        </View>
      )}
    </>
  );
}
