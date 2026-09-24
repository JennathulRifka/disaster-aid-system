import { useEffect, useRef, useState } from "react";
import { View, Text, AccessibilityInfo } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../context/AuthContext";

interface SosReport {
  id: string;
  type: string;
  status: "pending" | "acknowledged" | "in_progress" | "resolved";
}

const STATUS_STYLE: Record<string, { bg: string; text: string }> = {
  pending: { bg: "bg-red-50", text: "text-red-900" },
  acknowledged: { bg: "bg-amber-50", text: "text-amber-900" },
  in_progress: { bg: "bg-blue-50", text: "text-blue-900" },
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Received, awaiting response",
  acknowledged: "Acknowledged by an admin",
  in_progress: "Help is on the way",
};

/**
 * Live status for the reporter's own active SOS — this is the one place in
 * the app where "live" matters more than anywhere else: someone who just
 * called for help should see it's being handled without hunting for a page
 * or refreshing. Resolved reports don't show here (nothing left to track).
 */
export function SosStatusBanner() {
  const { profile } = useAuth();
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<SosReport | null>(null);
  const lastAnnouncedStatus = useRef<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    const q = query(collection(db, "sosRequests"), where("reporterId", "==", profile.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SosReport[];
      const unresolved = reports.find((r) => r.status !== "resolved");
      setActive(unresolved || null);
    });
    return unsubscribe;
  }, [profile]);

  // The one place in the app where "live" matters most (see the file
  // comment above) — accessibilityLiveRegion alone only covers Android, so
  // an explicit AccessibilityInfo announcement on every real status change
  // is what actually gets this heard on both platforms without the user
  // needing to have this banner in view or in focus.
  useEffect(() => {
    if (!active) {
      lastAnnouncedStatus.current = null;
      return;
    }
    if (lastAnnouncedStatus.current === active.status) return;
    lastAnnouncedStatus.current = active.status;
    AccessibilityInfo.announceForAccessibility(
      `SOS status update: ${STATUS_LABEL[active.status] || active.status}`
    );
  }, [active]);

  if (!active) return null;
  const style = STATUS_STYLE[active.status] || STATUS_STYLE.pending;

  return (
    <View
      className={`border-b border-gray-200 px-4 pb-3 ${style.bg}`}
      // This View renders as the very first thing in RootNavigator.tsx,
      // above NavigationContainer — none of React Navigation's own
      // safe-area handling (which every screen's header gets automatically)
      // applies here, so without an explicit top inset this banner collides
      // with the status bar/notch instead of sitting below it.
      style={{ paddingTop: insets.top + 12 }}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text className={`text-sm ${style.text}`}>
        <Text className="font-semibold" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          🆘{" "}
        </Text>
        <Text className="font-semibold">Your SOS: </Text>
        {STATUS_LABEL[active.status] || active.status}
      </Text>
    </View>
  );
}
