import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

type HazardType = "gauge" | "reservoir";
type HazardStatus = "alert" | "minor_flood" | "major_flood" | "elevated" | "high" | "spilling";

interface PendingAlert {
  id: string;
  hazardType?: HazardType; // absent on alerts created before reservoirs were added — treat as "gauge"
  station: string | null;
  basin: string | null;
  reservoir: string | null;
  district: string;
  status: HazardStatus;
  waterLevel: number | null;
  effectiveStoragePercent: number | null;
  message: string;
  createdAt: string;
}

interface SentAlert {
  id: string;
  hazardType?: HazardType;
  station: string | null;
  basin: string | null;
  reservoir: string | null;
  district: string;
  status: HazardStatus;
  waterLevel: number | null;
  effectiveStoragePercent: number | null;
  notifiedCount: number;
  source: "auto" | "admin_approved";
  approvedBy: string | null;
  sentAt: string;
}

const STATUS_LABEL: Record<string, string> = {
  alert: "Alert level",
  minor_flood: "Minor flood",
  major_flood: "Major flood",
  elevated: "Elevated storage",
  high: "Near capacity",
  spilling: "Spilling",
};

const STATUS_BADGE: Record<string, string> = {
  alert: "bg-amber-100 text-amber-800",
  minor_flood: "bg-orange-100 text-orange-800",
  major_flood: "bg-red-100 text-red-800",
  elevated: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  spilling: "bg-red-100 text-red-800",
};

// A gauge shows as "Peradeniya (Mahaweli Ganga)"; a reservoir as "Rajangana reservoir" —
// distinct enough phrasing that the two hazard types read clearly in the same list.
function alertSubjectLabel(a: { hazardType?: HazardType; station: string | null; basin: string | null; reservoir: string | null }) {
  return a.hazardType === "reservoir" ? `${a.reservoir} reservoir` : `${a.station} (${a.basin})`;
}

export default function AdminWaterAlerts() {
  const [autoSend, setAutoSend] = useState(false);
  const [savingToggle, setSavingToggle] = useState(false);
  const [pending, setPending] = useState<PendingAlert[]>([]);
  const [sent, setSent] = useState<SentAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [settings, pendingList, sentList] = await Promise.all([
      apiFetch("/api/water-alerts/settings"),
      apiFetch("/api/water-alerts/pending"),
      apiFetch("/api/water-alerts/sent"),
    ]);
    setAutoSend(settings.autoSend);
    setPending(pendingList);
    setSent(sentList);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggle() {
    setSavingToggle(true);
    try {
      const result = await apiFetch("/api/water-alerts/settings", {
        method: "PATCH",
        body: JSON.stringify({ autoSend: !autoSend }),
      });
      setAutoSend(result.autoSend);
    } finally {
      setSavingToggle(false);
    }
  }

  async function handleApprove(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/water-alerts/pending/${id}/approve`, { method: "POST" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  async function handleReject(id: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/water-alerts/pending/${id}/reject`, { method: "POST" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Water Level & Reservoir Area Alerts</h1>
      <p className="mt-1 text-sm text-gray-600">
        When a river gauge rises into alert/minor-flood/major-flood status, or a reservoir's storage rises into
        elevated/near-capacity/spilling, victims with an active request in the matching district can be notified
        automatically or only after you approve it — same "suggestion, not automatic" pattern already used for
        DMC alerts feeding active-district declarations. Reservoir status reflects the Irrigation Department's own
        published storage % and spilling flag as of their last daily bulletin — never a prediction of gate openings.
      </p>

      <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Auto-send</h2>
            <p className="mt-1 text-xs text-gray-500">
              {autoSend
                ? "On — a rising water level notifies matching victims immediately, no review needed."
                : "Off — a rising water level creates a pending alert below for you to approve or reject."}
            </p>
          </div>
          <button
            onClick={handleToggle}
            disabled={savingToggle || loading}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-medium disabled:opacity-50 ${
              autoSend ? "bg-green-600 text-white hover:bg-green-700" : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            {savingToggle ? "Saving..." : autoSend ? "Auto-send: On" : "Auto-send: Off"}
          </button>
        </div>
      </div>

      <div className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Pending review</h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        ) : pending.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No water-level or reservoir escalations waiting for review right now.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {pending.map((p) => (
              <li key={p.id} className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[p.status]}`}>
                    {STATUS_LABEL[p.status]}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{alertSubjectLabel(p)}</span>
                  <span className="text-sm text-gray-500">→ {p.district} district</span>
                </div>
                <p className="mt-1 text-sm text-gray-600">{p.message}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {p.waterLevel != null && `${p.waterLevel} m · `}
                  {p.effectiveStoragePercent != null && `${p.effectiveStoragePercent}% capacity · `}
                  {new Date(p.createdAt).toLocaleString()}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleApprove(p.id)}
                    disabled={actingOn === p.id}
                    className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    {actingOn === p.id ? "Sending..." : "Approve & send"}
                  </button>
                  <button
                    onClick={() => handleReject(p.id)}
                    disabled={actingOn === p.id}
                    className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Sent history</h2>
        {sent.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No area alerts have been sent yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {sent.map((s) => (
              <li key={s.id} className="border-b border-gray-100 pb-3 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[s.status]}`}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  <span className="text-sm font-medium text-gray-900">{alertSubjectLabel(s)}</span>
                  <span className="text-sm text-gray-500">→ {s.district} district</span>
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                    {s.notifiedCount} {s.notifiedCount === 1 ? "victim" : "victims"} notified
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  {s.source === "auto" ? "Sent automatically" : `Approved by ${s.approvedBy}`} —{" "}
                  {new Date(s.sentAt).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardLayout>
  );
}
