import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where, limit } from "firebase/firestore";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { db } from "@/lib/firebase";

interface Broadcast {
  id: string;
  message: string;
  severity: "info" | "warning" | "critical";
}

const SEVERITY_STYLES: Record<Broadcast["severity"], string> = {
  info: "bg-blue-50 text-blue-800 border-blue-200",
  warning: "bg-amber-50 text-amber-900 border-amber-200",
  critical: "bg-red-50 text-red-900 border-red-200",
};

const DISMISSED_KEY = "dismissedBroadcastId";
const DISMISSED_DISTRICTS_KEY = "dismissedActiveDistricts";

export function EmergencyBanner() {
  const { t } = useTranslation();
  const [broadcast, setBroadcast] = useState<Broadcast | null>(null);
  const [activeDistricts, setActiveDistricts] = useState<string[]>([]);
  const [districtsDismissed, setDistrictsDismissed] = useState(false);

  useEffect(() => {
    const activeQuery = query(collection(db, "broadcasts"), where("active", "==", true), limit(1));
    const unsubscribe = onSnapshot(activeQuery, (snapshot) => {
      if (snapshot.empty) {
        setBroadcast(null);
        return;
      }
      const doc = snapshot.docs[0];
      const data = { id: doc.id, ...doc.data() } as Broadcast;
      if (sessionStorage.getItem(DISMISSED_KEY) === data.id) return;
      setBroadcast(data);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    // Same underlying "active districts" data that powers the soft note on
    // VictimRequestForm.tsx — this is the other consumer, shown publicly.
    const unsubscribe = onSnapshot(collection(db, "activeDistricts"), (snapshot) => {
      const names = snapshot.docs.map((doc) => doc.data().district as string).sort();
      setActiveDistricts(names);
      setDistrictsDismissed(sessionStorage.getItem(DISMISSED_DISTRICTS_KEY) === names.join(","));
    });
    return unsubscribe;
  }, []);

  function dismissBroadcast() {
    if (broadcast) sessionStorage.setItem(DISMISSED_KEY, broadcast.id);
    setBroadcast(null);
  }

  function dismissDistricts() {
    sessionStorage.setItem(DISMISSED_DISTRICTS_KEY, activeDistricts.join(","));
    setDistrictsDismissed(true);
  }

  const showDistrictsBar = activeDistricts.length > 0 && !districtsDismissed;

  if (!broadcast && !showDistrictsBar) return null;

  return (
    <div>
      {showDistrictsBar && (
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{t("emergencyBanner.activeDistrictsLabel")}: </span>
            {activeDistricts.join(", ")}
          </span>
          <button
            onClick={dismissDistricts}
            aria-label={t("common.close")}
            className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-black/5"
          >
            {t("common.close")}
          </button>
        </div>
      )}
      {broadcast && (
        <div className={`flex items-center gap-3 border-b px-4 py-3 text-sm ${SEVERITY_STYLES[broadcast.severity]}`}>
          <AlertTriangle size={18} className="shrink-0" />
          <span className="flex-1">
            <span className="font-semibold">{t("emergencyBanner.label")}: </span>
            {broadcast.message}
          </span>
          <button
            onClick={dismissBroadcast}
            aria-label={t("common.close")}
            className="shrink-0 rounded px-2 py-1 text-xs font-medium hover:bg-black/5"
          >
            {t("common.close")}
          </button>
        </div>
      )}
    </div>
  );
}
