import { useEffect, useState } from "react";
import { requestAndRegisterFcmToken, onForegroundMessage } from "@/lib/notifications";

const DISMISS_KEY = "notificationPromptDismissed";

/**
 * Handles the whole push-notification lifecycle for a logged-in user:
 * silently (re-)registers the device's token if permission was already
 * granted in a previous session, offers a one-line opt-in prompt if
 * permission hasn't been decided yet, and shows a toast for messages that
 * arrive while the tab is open (background messages are handled by
 * firebase-messaging-sw.js instead — FCM never delivers a foreground
 * message through the service worker).
 */
export function NotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    typeof Notification === "undefined" ? "unsupported" : Notification.permission
  );
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem(DISMISS_KEY) === "true");
  const [toast, setToast] = useState<{ title: string; body: string } | null>(null);

  useEffect(() => {
    if (permission === "granted") {
      requestAndRegisterFcmToken();
    }
  }, [permission]);

  useEffect(() => {
    return onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      if (title) {
        setToast({ title, body: body || "" });
        setTimeout(() => setToast(null), 8000);
      }
    });
  }, []);

  async function handleEnable() {
    const result = await requestAndRegisterFcmToken();
    setPermission(result === "unsupported" ? "unsupported" : result === "granted" ? "granted" : "denied");
  }

  function handleDismiss() {
    sessionStorage.setItem(DISMISS_KEY, "true");
    setDismissed(true);
  }

  return (
    <>
      {permission === "default" && !dismissed && (
        <div className="flex items-center justify-between gap-4 border-b border-blue-100 bg-blue-50 px-4 py-2 text-sm text-blue-900">
          <span>Get notified the moment your request is approved or your delivery is on the way.</span>
          <div className="flex shrink-0 items-center gap-3">
            <button onClick={handleEnable} className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700">
              Enable notifications
            </button>
            <button onClick={handleDismiss} className="text-xs text-blue-700 hover:underline">
              Not now
            </button>
          </div>
        </div>
      )}

      {toast && (
        // z-[1200]: above Leaflet's own map panes/controls (raw z-index up to
        // 1000), same fix as SosButton.tsx's modal — this toast can appear
        // over any page, including ones with a map.
        <div className="fixed bottom-4 right-4 z-[1200] w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
          <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
          {toast.body && <p className="mt-1 text-sm text-gray-600">{toast.body}</p>}
        </div>
      )}
    </>
  );
}
