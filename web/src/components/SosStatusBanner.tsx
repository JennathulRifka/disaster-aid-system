import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

interface SosReport {
  id: string;
  type: string;
  status: "pending" | "acknowledged" | "in_progress" | "resolved";
}

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-red-50 text-red-900 border-red-200",
  acknowledged: "bg-amber-50 text-amber-900 border-amber-200",
  in_progress: "bg-blue-50 text-blue-900 border-blue-200",
};

/**
 * Live status for the reporter's own active SOS — this is the one place in
 * the app where "live" matters more than anywhere else: someone who just
 * called for help should see it's being handled without hunting for a page
 * or refreshing. Resolved reports don't show here (nothing left to track).
 */
export function SosStatusBanner() {
  const { profile } = useAuth();
  const { t } = useTranslation();
  const [active, setActive] = useState<SosReport | null>(null);

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

  if (!active) return null;

  return (
    <div className={`border-b px-4 py-3 text-sm ${STATUS_STYLE[active.status]}`}>
      <span className="font-semibold">🆘 {t("sos.bannerLabel")}: </span>
      {t(`sos.status.${active.status}`)}
    </div>
  );
}
