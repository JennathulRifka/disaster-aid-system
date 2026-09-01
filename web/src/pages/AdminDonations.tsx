import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";
import { exportToCsv, exportToPdf } from "@/lib/export";

interface Donation {
  id: string;
  donorName: string;
  category: string;
  quantity: string;
  status: string;
  deliveryMethod: "self" | "volunteer";
  matchedRequestId: string | null;
  assignedDeliveryId: string | null;
  deliveryStatus: string | null;
  lastRejectionReason?: string | null;
  createdAt: string;
}

const EXPORT_HEADERS = ["Donor", "Category", "Quantity", "Delivery", "Status", "Created At"];

interface Volunteer {
  uid: string;
  name: string;
  email: string;
  available?: boolean;
}

export default function AdminDonations() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState<Record<string, string>>({});
  const [exportFrom, setExportFrom] = useState("");
  const [exportTo, setExportTo] = useState("");

  const exportableDonations = useMemo(() => {
    const toBound = exportTo ? `${exportTo}T23:59:59.999Z` : null;
    return donations.filter((d) => {
      if (exportFrom && d.createdAt < exportFrom) return false;
      if (toBound && d.createdAt > toBound) return false;
      return true;
    });
  }, [donations, exportFrom, exportTo]);

  function handleExport(format: "csv" | "pdf") {
    const rows = exportableDonations.map((d) => [
      d.donorName,
      d.category,
      d.quantity,
      d.deliveryMethod === "self" ? "Self-delivery" : "Volunteer",
      d.status,
      new Date(d.createdAt).toLocaleString(),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      exportToCsv(`donations-${stamp}.csv`, EXPORT_HEADERS, rows);
    } else {
      exportToPdf(`donations-${stamp}.pdf`, "Donations", EXPORT_HEADERS, rows);
    }
  }

  useEffect(() => {
    apiFetch("/api/users/volunteers").then(setVolunteers);
  }, []);

  const availableVolunteers = volunteers.filter((v) => v.available !== false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "donations"), (snapshot) => {
      const data = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Donation);
      setDonations(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  async function handleMatch(id: string) {
    setActingOn(id);
    setMessage("");
    try {
      const result = await apiFetch(`/api/donations/${id}/match`, { method: "POST" });
      const base = `Matched to request ${result.matchedRequestId} (${result.distanceKm} km away).`;
      setMessage(
        result.autoAssignedVolunteer
          ? `${base} Auto-assigned to ${result.autoAssignedVolunteer.name} (nearest available).`
          : `${base}${
              result.deliveryId === null ? " No available volunteer with a location set — assign one manually below." : ""
            }`
      );
      // No manual refetch — the onSnapshot listener above picks up the change.
    } catch (err: any) {
      setMessage(err.message || "No matching request found.");
    } finally {
      setActingOn(null);
    }
  }

  async function handleAssignVolunteer(donation: Donation, isReassign: boolean) {
    const volunteerId = selectedVolunteer[donation.id];
    if (!volunteerId) {
      setMessage("Pick a volunteer first.");
      return;
    }
    if (!donation.matchedRequestId) return;

    setActingOn(donation.id);
    setMessage("");
    try {
      await apiFetch("/api/deliveries", {
        method: "POST",
        body: JSON.stringify({
          requestId: donation.matchedRequestId,
          donationId: donation.id,
          volunteerId,
        }),
      });
      setMessage(
        isReassign
          ? "Reassigned. The new volunteer will see it in their deliveries list once they accept."
          : "Volunteer assigned. They'll see it in their deliveries list once they accept."
      );
    } catch (err: any) {
      setMessage(err.message || "Failed to assign volunteer.");
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Donations</h1>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Period from</label>
          <input
            type="date"
            value={exportFrom}
            onChange={(e) => setExportFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">to</label>
          <input
            type="date"
            value={exportTo}
            onChange={(e) => setExportTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {exportableDonations.length} of {donations.length} in period
          </span>
          <button
            onClick={() => handleExport("csv")}
            disabled={exportableDonations.length === 0}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={exportableDonations.length === 0}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      {message && (
        <div className="mt-4 rounded border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Donor</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Quantity</th>
                <th className="px-4 py-3">Delivery</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {donations.map((d) => (
                <tr key={d.id}>
                  <td className="px-4 py-3">{d.donorName}</td>
                  <td className="px-4 py-3 capitalize">{d.category}</td>
                  <td className="px-4 py-3">{d.quantity}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {d.deliveryMethod === "self" ? "Self-delivery" : "Volunteer"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={d.status} />
                  </td>
                  <td className="px-4 py-3">
                    {d.status === "available" && (
                      <button
                        disabled={actingOn === d.id}
                        onClick={() => handleMatch(d.id)}
                        className="rounded bg-orange-600 px-3 py-1 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                      >
                        Find match
                      </button>
                    )}

                    {d.status === "matched" && d.deliveryMethod === "self" && (
                      <span className="text-xs font-medium text-green-700">Donor self-delivering ✓</span>
                    )}

                    {d.status === "matched" && d.deliveryMethod === "volunteer" && !d.assignedDeliveryId && (
                      <div className="flex flex-col gap-1">
                        <p className="text-xs text-amber-700">
                          No auto-assign match (no available volunteer with a location set).
                        </p>
                        {d.lastRejectionReason !== undefined && d.lastRejectionReason !== null && (
                          <p className="text-xs text-red-600">
                            Previous volunteer rejected
                            {d.lastRejectionReason ? `: "${d.lastRejectionReason}"` : " (no reason given)"}
                          </p>
                        )}
                        {availableVolunteers.length === 0 ? (
                          <p className="text-xs text-gray-400">No volunteers currently available.</p>
                        ) : (
                          <div className="flex items-center gap-2">
                            <select
                              value={selectedVolunteer[d.id] || ""}
                              onChange={(e) =>
                                setSelectedVolunteer((prev) => ({ ...prev, [d.id]: e.target.value }))
                              }
                              className="rounded border border-gray-300 px-2 py-1 text-xs"
                            >
                              <option value="">Select volunteer...</option>
                              {availableVolunteers.map((v) => (
                                <option key={v.uid} value={v.uid}>
                                  {v.name}
                                </option>
                              ))}
                            </select>
                            <button
                              disabled={actingOn === d.id}
                              onClick={() => handleAssignVolunteer(d, false)}
                              className="rounded bg-purple-600 px-3 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-50"
                            >
                              Assign
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {d.status === "matched" &&
                      d.deliveryMethod === "volunteer" &&
                      d.assignedDeliveryId &&
                      d.deliveryStatus === "pending_acceptance" && (
                        <div className="flex flex-col gap-1">
                          <span className="text-xs font-medium text-gray-600">Awaiting volunteer response...</span>
                          {availableVolunteers.length > 0 && (
                            <div className="flex items-center gap-2">
                              <select
                                value={selectedVolunteer[d.id] || ""}
                                onChange={(e) =>
                                  setSelectedVolunteer((prev) => ({ ...prev, [d.id]: e.target.value }))
                                }
                                className="rounded border border-gray-300 px-2 py-1 text-xs"
                              >
                                <option value="">Reassign to...</option>
                                {availableVolunteers.map((v) => (
                                  <option key={v.uid} value={v.uid}>
                                    {v.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                disabled={actingOn === d.id}
                                onClick={() => handleAssignVolunteer(d, true)}
                                className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                              >
                                Reassign
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                    {d.status === "matched" &&
                      d.deliveryMethod === "volunteer" &&
                      d.assignedDeliveryId &&
                      d.deliveryStatus !== "pending_acceptance" && (
                        <span className="text-xs font-medium text-gray-600">Volunteer assigned ✓</span>
                      )}

                    {(d.status === "delivered" || (d.status !== "available" && d.status !== "matched")) && (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {donations.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-sm text-gray-500">
                    No donations yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {volunteers.length === 0 && !loading && (
        <p className="mt-4 text-xs text-gray-500">
          No volunteers registered yet — you'll need at least one volunteer account before you can assign
          deliveries.
        </p>
      )}
      {volunteers.length > 0 && availableVolunteers.length === 0 && !loading && (
        <p className="mt-4 text-xs text-gray-500">
          All {volunteers.length} registered volunteer{volunteers.length === 1 ? "" : "s"} {volunteers.length === 1 ? "is" : "are"} currently marked unavailable.
        </p>
      )}
    </DashboardLayout>
  );
}
