import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface CommunityReport {
  id: string;
  reporterName: string;
  type: "road_closure" | "water_level" | "other";
  description: string;
  location: { lat: number; lng: number };
  district: string;
  status: "unverified" | "verified" | "dismissed";
  createdAt: string;
  verifiedAt: string | null;
  verifiedBy: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  road_closure: "Road closure",
  water_level: "Water level / flooding",
  other: "Other condition",
};

const STATUS_BADGE: Record<string, string> = {
  unverified: "bg-amber-100 text-amber-800",
  verified: "bg-green-100 text-green-800",
  dismissed: "bg-gray-100 text-gray-600",
};

export default function AdminCommunityReports() {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activateChecked, setActivateChecked] = useState<Record<string, boolean>>({});

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/community-reports");
    setReports(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleVerify(id: string, approve: boolean) {
    setActingOn(id);
    try {
      await apiFetch(`/api/community-reports/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ approve, activateDistrict: approve ? !!activateChecked[id] : false }),
      });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  const unverified = reports.filter((r) => r.status === "unverified");
  const decided = reports.filter((r) => r.status !== "unverified");

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Community Reports</h1>
      <p className="mt-1 text-sm text-gray-600">
        Road closures and water conditions reported by volunteers in the field. Verify before they appear on the
        situation map or the public severity map — an unverified report is never shown publicly. Verifying can
        also declare the report's district an active emergency in one step.
      </p>

      <div className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Awaiting review</h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        ) : unverified.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No reports waiting for review.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {unverified.map((r) => (
              <li key={r.id} className="rounded border border-gray-200 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                    {r.status}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{TYPE_LABEL[r.type]}</span>
                  <span className="text-sm text-gray-500">— {r.district} district</span>
                </div>
                <p className="mt-1 text-sm text-gray-700">{r.description}</p>
                <p className="mt-1 text-xs text-gray-400">
                  Reported by {r.reporterName} — {new Date(r.createdAt).toLocaleString()}
                </p>
                <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                  <input
                    type="checkbox"
                    checked={!!activateChecked[r.id]}
                    onChange={(e) => setActivateChecked((prev) => ({ ...prev, [r.id]: e.target.checked }))}
                  />
                  Also declare {r.district} an active emergency
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => handleVerify(r.id, true)}
                    disabled={actingOn === r.id}
                    className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {actingOn === r.id ? "Saving..." : "Verify"}
                  </button>
                  <button
                    onClick={() => handleVerify(r.id, false)}
                    disabled={actingOn === r.id}
                    className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    Dismiss
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {decided.length > 0 && (
        <div className="mt-6 max-w-2xl rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Reviewed</h2>
          <ul className="mt-3 space-y-2">
            {decided.map((r) => (
              <li key={r.id} className="border-b border-gray-100 pb-2 text-sm last:border-0 last:pb-0">
                <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                  {r.status}
                </span>
                {TYPE_LABEL[r.type]} — {r.district} — {r.description}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardLayout>
  );
}
