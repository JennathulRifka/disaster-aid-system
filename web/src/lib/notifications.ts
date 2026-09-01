import { getToken, onMessage, type MessagePayload } from "firebase/messaging";
import { messagingPromise } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";

// Firebase Console > Project Settings > Cloud Messaging > Web configuration
// > "Web Push certificates" > generate/copy the key pair. Required for
// getToken() to work at all — without it this silently returns null.
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY;

/**
 * Requests browser notification permission (if not already decided) and, if
 * granted, registers this device's FCM token with the backend so it can
 * receive push notifications. Safe to call on every login — re-registering
 * an already-known token is a no-op server-side (arrayUnion).
 */
export async function requestAndRegisterFcmToken(): Promise<"granted" | "denied" | "unsupported"> {
  if (typeof Notification === "undefined") return "unsupported";
  if (!VAPID_KEY) {
    console.warn("VITE_FIREBASE_VAPID_KEY is not set — cannot register for push notifications.");
    return "unsupported";
  }

  const messaging = await messagingPromise;
  if (!messaging) return "unsupported";

  const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
  if (permission !== "granted") return "denied";

  try {
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    if (token) {
      await apiFetch("/api/users/fcm-token", { method: "POST", body: JSON.stringify({ token }) });
    }
    return "granted";
  } catch (err) {
    console.error("Failed to register FCM token:", err);
    return "denied";
  }
}

/** Subscribes to messages that arrive while this tab is focused/open. Returns an unsubscribe function. */
export function onForegroundMessage(callback: (payload: MessagePayload) => void): () => void {
  let unsubscribe = () => {};
  messagingPromise.then((messaging) => {
    if (messaging) unsubscribe = onMessage(messaging, callback);
  });
  return () => unsubscribe();
}
