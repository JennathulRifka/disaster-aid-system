import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

/**
 * Live unread-notification count for the current user — lives outside
 * NotificationsScreen.tsx itself so the tab bar's badge dot can reflect it
 * even while that screen isn't mounted (e.g. sitting on Home when a new
 * notification arrives). Same onSnapshot/where("uid","==",...) shape as
 * NotificationsScreen.tsx's own listener, just projected down to a count.
 */
export function useUnreadNotificationCount(): number {
  const { profile } = useAuth();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!profile) {
      setCount(0);
      return;
    }
    const q = query(
      collection(db, "notifications"),
      where("uid", "==", profile.uid),
      where("read", "==", false)
    );
    const unsubscribe = onSnapshot(q, (snap) => setCount(snap.size));
    return unsubscribe;
  }, [profile]);

  return count;
}
