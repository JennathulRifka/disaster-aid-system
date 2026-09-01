import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import "@/lib/leafletIcons";
import { DashboardLayout } from "@/components/DashboardLayout";
import { db } from "@/lib/firebase";
import { apiFetch } from "@/lib/api";

interface SosReport {
  id: string;
  reporterName: string;
  reporterPhone: string | null;
  type: "trapped" | "missing_person" | "flood_rescue" | "other";
  peopleCount: number | null;
  description: string;
  location: { lat: number; lng: number };
  status: "pending" | "acknowledged" | "in_progress" | "resolved";
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = {
  trapped: "Trapped",
  missing_person: "Missing Person",
  flood_rescue: "Flood Rescue",
  other: "Other Emergency",
};

const STATUS_COLOR: Record<string, string> = {
  pending: "#dc2626",
  acknowledged: "#f59e0b",
  in_progress: "#2563eb",
  resolved: "#6b7280",
};

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-red-100 text-red-800",
  acknowledged: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  resolved: "bg-gray-100 text-gray-600",
};

const NEXT_ACTION: Record<string, { label: string; next: string } | null> = {
  pending: { label: "Acknowledge", next: "acknowledged" },
  acknowledged: { label: "Start response", next: "in_progress" },
  in_progress: { label: "Mark resolved", next: "resolved" },
  resolved: null,
};

const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];

export default function AdminSos() {
  const [reports, setReports] = useState<SosReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "sosRequests"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as SosReport[];
      setReports(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const unresolved = reports
    .filter((r) => r.status !== "resolved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const resolved = reports
    .filter((r) => r.status === "resolved")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  async function advanceStatus(id: string, nextStatus: string) {
    setActingOn(id);
    try {
      await apiFetch(`/api/sos/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus }),
      });
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">🆘 SOS Dispatch</h1>
        <p className="text-sm text-gray-500">{unresolved.length} unresolved</p>
      </div>
      <p className="mt-1 text-sm text-gray-600">
        Life-safety reports — trapped, missing persons, flood rescue — separate from aid requests. Status only:
        acknowledge, mark in progress while you coordinate a response, then resolve. This board updates live.
      </p>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200" style={{ height: "400px" }}>
        <MapContainer center={SRI_LANKA_CENTER} zoom={8} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {unresolved.map((r) => (
            <CircleMarker
              key={r.id}
              center={[r.location.lat, r.location.lng]}
              radius={10}
              pathOptions={{ color: STATUS_COLOR[r.status], fillColor: STATUS_COLOR[r.status], fillOpacity: 0.7 }}
            >
              <Popup>
                <strong>{TYPE_LABEL[r.type]}</strong> — {r.reporterName}
                <br />
                {r.peopleCount != null && `${r.peopleCount} people affected`}
                {r.description && (
                  <>
                    <br />
                    {r.description}
                  </>
                )}
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>

      <div className="mt-6 max-w-3xl rounded-xl border border-gray-200 bg-white p-6">
        <h2 className="text-sm font-semibold text-gray-900">Active reports</h2>
        {loading ? (
          <p className="mt-2 text-sm text-gray-500">Loading...</p>
        ) : unresolved.length === 0 ? (
          <p className="mt-2 text-sm text-gray-500">No active SOS reports right now.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {unresolved.map((r) => {
              const action = NEXT_ACTION[r.status];
              return (
                <li key={r.id} className="rounded border border-gray-200 p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[r.status]}`}>
                      {r.status.replace("_", " ")}
                    </span>
                    <span className="text-sm font-semibold text-gray-900">{TYPE_LABEL[r.type]}</span>
                    <span className="text-sm text-gray-600">reported by {r.reporterName}</span>
                    {r.reporterPhone && <span className="text-xs text-gray-400">({r.reporterPhone})</span>}
                  </div>
                  {r.peopleCount != null && (
                    <p className="mt-1 text-sm text-gray-600">{r.peopleCount} people affected</p>
                  )}
                  {r.description && <p className="mt-1 text-sm text-gray-600">{r.description}</p>}
                  <p className="mt-1 text-xs text-gray-400">
                    {r.location.lat.toFixed(4)}, {r.location.lng.toFixed(4)} · {new Date(r.createdAt).toLocaleString()}
                  </p>
                  {action && (
                    <button
                      onClick={() => advanceStatus(r.id, action.next)}
                      disabled={actingOn === r.id}
                      className="mt-2 rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {actingOn === r.id ? "Updating..." : action.label}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {resolved.length > 0 && (
        <div className="mt-6 max-w-3xl rounded-xl border border-gray-200 bg-white p-6">
          <h2 className="text-sm font-semibold text-gray-900">Resolved</h2>
          <ul className="mt-3 space-y-2">
            {resolved.map((r) => (
              <li key={r.id} className="border-b border-gray-100 pb-2 text-sm text-gray-500 last:border-0 last:pb-0">
                {TYPE_LABEL[r.type]} — {r.reporterName} — resolved {new Date(r.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </div>
      )}
    </DashboardLayout>
  );
}
