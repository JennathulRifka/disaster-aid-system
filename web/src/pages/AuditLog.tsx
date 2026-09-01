import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
  targetType: string;
  targetId: string | null;
  details: Record<string, any>;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  "request.approve": "Approved request",
  "request.reject": "Rejected request",
  "request.bulk_approve": "Bulk-approved requests",
  "request.bulk_reject": "Bulk-rejected requests",
  "donation.match": "Matched donation",
  "delivery.assign": "Assigned volunteer",
  "delivery.reassign": "Reassigned volunteer",
  "district.activate": "Activated district",
  "district.deactivate": "Deactivated district",
  "area_alert.approve": "Approved area alert",
  "area_alert.reject": "Rejected area alert",
  "sos.status_update": "Updated SOS status",
  "community_report.verify": "Verified community report",
  "community_report.dismiss": "Dismissed community report",
};

const ACTION_BADGE: Record<string, string> = {
  "request.approve": "bg-green-100 text-green-800",
  "request.reject": "bg-red-100 text-red-800",
  "request.bulk_approve": "bg-green-100 text-green-800",
  "request.bulk_reject": "bg-red-100 text-red-800",
  "donation.match": "bg-purple-100 text-purple-800",
  "delivery.assign": "bg-blue-100 text-blue-800",
  "delivery.reassign": "bg-blue-100 text-blue-800",
  "district.activate": "bg-red-100 text-red-800",
  "district.deactivate": "bg-gray-100 text-gray-800",
  "area_alert.approve": "bg-blue-100 text-blue-800",
  "area_alert.reject": "bg-gray-100 text-gray-800",
  "sos.status_update": "bg-red-100 text-red-800",
  "community_report.verify": "bg-green-100 text-green-800",
  "community_report.dismiss": "bg-gray-100 text-gray-800",
};

function describeEntry(entry: AuditEntry) {
  switch (entry.action) {
    case "request.approve":
    case "request.reject":
      return `Request for ${entry.details.victimName || entry.targetId}`;
    case "request.bulk_approve":
    case "request.bulk_reject":
      return `${entry.details.count} request${entry.details.count === 1 ? "" : "s"}: ${(entry.details.ids || []).join(", ")}`;
    case "donation.match":
      return `Donation ${entry.targetId} (${entry.details.category}) → request ${entry.details.matchedRequestId}`;
    case "delivery.assign": {
      const who = entry.details.volunteerName || entry.details.volunteerId;
      const source = entry.details.source === "auto" ? " (auto-assigned, nearest available)" : "";
      return `Volunteer ${who} → request ${entry.details.requestId}${source}`;
    }
    case "delivery.reassign":
      return `Volunteer ${entry.details.volunteerId} → request ${entry.details.requestId} (was ${entry.details.previousVolunteerId})`;
    case "district.activate":
      return `${entry.details.district}${entry.details.sourceAlertTitle ? ` (from DMC alert: "${entry.details.sourceAlertTitle}")` : " (manual)"}`;
    case "district.deactivate":
      return entry.details.district;
    case "area_alert.approve":
      return `${entry.details.station} → ${entry.details.district} district (${entry.details.notifiedCount} notified)`;
    case "area_alert.reject":
      return `${entry.details.station} → ${entry.details.district} district`;
    case "sos.status_update":
      return `${entry.details.reporterName} (${entry.details.sosType}) → ${entry.details.newStatus}`;
    case "community_report.verify":
    case "community_report.dismiss":
      return `${entry.details.reportType} by ${entry.details.reporterName} — ${entry.details.district || "unknown district"}`;
    default:
      return entry.targetId || "";
  }
}

export default function AuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/audit-log")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Audit Log</h1>
      <p className="mt-1 text-sm text-gray-600">
        Who approved, rejected, matched, or assigned what, and when — the last 100 actions.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="px-4 py-3 text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">{entry.actorName}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ACTION_BADGE[entry.action] || "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {ACTION_LABELS[entry.action] || entry.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-600">{describeEntry(entry)}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No actions logged yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
