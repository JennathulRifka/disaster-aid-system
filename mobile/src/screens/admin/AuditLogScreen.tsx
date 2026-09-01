import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { apiFetch } from "../../lib/api";

interface AuditEntry {
  id: string;
  action: string;
  actorName: string;
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

const ACTION_BADGE: Record<string, { bg: string; text: string }> = {
  "request.approve": { bg: "bg-green-100", text: "text-green-800" },
  "request.reject": { bg: "bg-red-100", text: "text-red-800" },
  "request.bulk_approve": { bg: "bg-green-100", text: "text-green-800" },
  "request.bulk_reject": { bg: "bg-red-100", text: "text-red-800" },
  "donation.match": { bg: "bg-purple-100", text: "text-purple-800" },
  "delivery.assign": { bg: "bg-blue-100", text: "text-blue-800" },
  "delivery.reassign": { bg: "bg-blue-100", text: "text-blue-800" },
  "district.activate": { bg: "bg-red-100", text: "text-red-800" },
  "district.deactivate": { bg: "bg-gray-100", text: "text-gray-800" },
  "area_alert.approve": { bg: "bg-blue-100", text: "text-blue-800" },
  "area_alert.reject": { bg: "bg-gray-100", text: "text-gray-800" },
  "sos.status_update": { bg: "bg-red-100", text: "text-red-800" },
  "community_report.verify": { bg: "bg-green-100", text: "text-green-800" },
  "community_report.dismiss": { bg: "bg-gray-100", text: "text-gray-800" },
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
      const source = entry.details.source === "auto" ? " (auto-assigned)" : "";
      return `Volunteer ${who} → request ${entry.details.requestId}${source}`;
    }
    case "delivery.reassign":
      return `Volunteer ${entry.details.volunteerId} → request ${entry.details.requestId} (was ${entry.details.previousVolunteerId})`;
    case "district.activate":
      return `${entry.details.district}${entry.details.sourceAlertTitle ? ` (from DMC alert)` : " (manual)"}`;
    case "district.deactivate":
      return entry.details.district;
    case "area_alert.approve":
      return `${entry.details.station} → ${entry.details.district} (${entry.details.notifiedCount} notified)`;
    case "area_alert.reject":
      return `${entry.details.station} → ${entry.details.district}`;
    case "sos.status_update":
      return `${entry.details.reporterName} (${entry.details.sosType}) → ${entry.details.newStatus}`;
    case "community_report.verify":
    case "community_report.dismiss":
      return `${entry.details.reportType} by ${entry.details.reporterName} — ${entry.details.district || "unknown district"}`;
    default:
      return entry.targetId || "";
  }
}

export function AuditLogScreen() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/audit-log")
      .then(setEntries)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Audit Log</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Who approved, rejected, matched, or assigned what, and when — the last 100 actions.
      </Text>

      {entries.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No actions logged yet.</Text>
      ) : (
        <View className="mt-4" style={{ gap: 10 }}>
          {entries.map((entry) => {
            const badge = ACTION_BADGE[entry.action] || { bg: "bg-gray-100", text: "text-gray-800" };
            return (
              <View key={entry.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <View className="flex-row items-center justify-between">
                  <View className={`self-start rounded-full px-2 py-0.5 ${badge.bg}`}>
                    <Text className={`text-xs font-medium ${badge.text}`}>
                      {ACTION_LABELS[entry.action] || entry.action}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500">{new Date(entry.createdAt).toLocaleString()}</Text>
                </View>
                <Text className="mt-2 text-sm text-gray-800">{describeEntry(entry)}</Text>
                <Text className="mt-1 text-xs text-gray-400">by {entry.actorName}</Text>
              </View>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
