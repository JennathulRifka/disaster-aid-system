import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { CaseNotesModal } from "@/components/CaseNotesModal";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";
import { nearestDistrict } from "@/lib/districts";
import { exportToCsv, exportToPdf } from "@/lib/export";

interface RequestItem {
  category: string;
  quantity: number;
  status: string;
}

interface AidRequest {
  id: string;
  victimName: string;
  disasterType: string;
  items: RequestItem[];
  severity: string;
  peopleAffected: number;
  status: string;
  priorityScore: number;
  possibleDuplicate?: boolean;
  location?: { lat: number; lng: number };
  createdAt: string;
}

const DISASTER_TYPES = ["flood", "landslide", "cyclone", "drought", "other"];
const STATUSES = ["pending", "verified", "rejected", "in_progress", "delivered"];

export default function AdminRequests() {
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [notesFor, setNotesFor] = useState<AidRequest | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActing, setBulkActing] = useState(false);
  const [searchName, setSearchName] = useState("");
  const [filterDisasterType, setFilterDisasterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterDistrict, setFilterDistrict] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [staleThresholdHours, setStaleThresholdHours] = useState(6);
  const [staleOnly, setStaleOnly] = useState(false);
  const [tick, setTick] = useState(0);

  // Requests don't become "stale" via a Firestore write — they become stale
  // purely by the clock moving. Re-render periodically so the flag/filter
  // catch that without needing any new data to arrive.
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "aidRequests"), (snapshot) => {
      const data = snapshot.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }) as AidRequest)
        .sort((a, b) => (b.priorityScore || 0) - (a.priorityScore || 0));
      setRequests(data);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Keep the selection valid as live data changes — e.g. if a selected row
  // gets approved from another tab, drop it from the selection automatically.
  useEffect(() => {
    setSelectedIds((prev) => {
      const pendingIds = new Set(requests.filter((r) => r.status === "pending").map((r) => r.id));
      const next = new Set([...prev].filter((id) => pendingIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [requests]);

  const districtOptions = useMemo(() => {
    const names = new Set(
      requests.map((r) => nearestDistrict(r.location)).filter((d): d is string => Boolean(d))
    );
    return [...names].sort();
  }, [requests]);

  // Stale = still awaiting admin attention (pending, or verified but no item
  // matched yet — "in_progress" already means at least one item is moving)
  // and it's been sitting that way longer than the threshold since submission.
  function isStale(r: AidRequest) {
    if (r.status !== "pending" && r.status !== "verified") return false;
    const ageHours = (Date.now() - new Date(r.createdAt).getTime()) / 3_600_000;
    return ageHours >= staleThresholdHours;
  }

  function staleAgeLabel(r: AidRequest) {
    const ageHours = (Date.now() - new Date(r.createdAt).getTime()) / 3_600_000;
    return ageHours >= 48 ? `${Math.floor(ageHours / 24)}d` : `${Math.floor(ageHours)}h`;
  }

  const filteredRequests = useMemo(() => {
    const nameQuery = searchName.trim().toLowerCase();
    const toBound = dateTo ? `${dateTo}T23:59:59.999Z` : null;
    return requests.filter((r) => {
      if (nameQuery && !r.victimName?.toLowerCase().includes(nameQuery)) return false;
      if (filterDisasterType && r.disasterType !== filterDisasterType) return false;
      if (filterStatus && r.status !== filterStatus) return false;
      if (filterDistrict && nearestDistrict(r.location) !== filterDistrict) return false;
      if (dateFrom && r.createdAt < dateFrom) return false;
      if (toBound && r.createdAt > toBound) return false;
      if (staleOnly && !isStale(r)) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, searchName, filterDisasterType, filterStatus, filterDistrict, dateFrom, dateTo, staleOnly, staleThresholdHours, tick]);

  const hasActiveFilters =
    searchName || filterDisasterType || filterStatus || filterDistrict || dateFrom || dateTo || staleOnly;

  function clearFilters() {
    setSearchName("");
    setFilterDisasterType("");
    setFilterStatus("");
    setFilterDistrict("");
    setDateFrom("");
    setDateTo("");
    setStaleOnly(false);
  }

  async function handleVerify(id: string, approve: boolean) {
    setActingOn(id);
    try {
      await apiFetch(`/api/requests/${id}/verify`, {
        method: "PATCH",
        body: JSON.stringify({ approve }),
      });
      // No manual refetch — the onSnapshot listener above picks up the change.
    } finally {
      setActingOn(null);
    }
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllPending() {
    const pendingIds = filteredRequests.filter((r) => r.status === "pending").map((r) => r.id);
    setSelectedIds((prev) => (prev.size === pendingIds.length ? new Set() : new Set(pendingIds)));
  }

  const EXPORT_HEADERS = [
    "Priority",
    "Victim",
    "Disaster",
    "Items",
    "Severity",
    "Affected",
    "Status",
    "District",
    "Created At",
  ];

  function handleExport(format: "csv" | "pdf") {
    const rows = filteredRequests.map((r) => [
      r.priorityScore?.toFixed(0) ?? "",
      r.victimName,
      r.disasterType,
      (r.items || []).map((item) => `${item.category} x${item.quantity}`).join("; "),
      r.severity,
      r.peopleAffected,
      r.status,
      nearestDistrict(r.location) || "",
      new Date(r.createdAt).toLocaleString(),
    ]);
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      exportToCsv(`aid-requests-${stamp}.csv`, EXPORT_HEADERS, rows);
    } else {
      exportToPdf(`aid-requests-${stamp}.pdf`, "Aid Requests", EXPORT_HEADERS, rows);
    }
  }

  async function handleBulkVerify(approve: boolean) {
    if (selectedIds.size === 0) return;
    setBulkActing(true);
    try {
      await apiFetch("/api/requests/bulk-verify", {
        method: "PATCH",
        body: JSON.stringify({ ids: [...selectedIds], approve }),
      });
      setSelectedIds(new Set());
      // No manual refetch — the onSnapshot listener above picks up the change.
    } finally {
      setBulkActing(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">Aid Requests</h1>
        <p className="text-sm text-gray-500">Sorted by priority score, highest first</p>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Search victim</label>
          <input
            value={searchName}
            onChange={(e) => setSearchName(e.target.value)}
            placeholder="Name..."
            className="w-40 rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Disaster type</label>
          <select
            value={filterDisasterType}
            onChange={(e) => setFilterDisasterType(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm capitalize"
          >
            <option value="">All</option>
            {DISASTER_TYPES.map((type) => (
              <option key={type} value={type} className="capitalize">
                {type}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Status</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {STATUSES.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">District</label>
          <select
            value={filterDistrict}
            onChange={(e) => setFilterDistrict(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">All</option>
            {districtOptions.map((district) => (
              <option key={district} value={district}>
                {district}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Stale threshold</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={staleThresholdHours}
              onChange={(e) => setStaleThresholdHours(Math.max(1, Number(e.target.value)))}
              className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm"
            />
            <span className="text-xs text-gray-500">hrs</span>
          </div>
        </div>
        <label className="flex items-center gap-2 pb-1.5 text-sm text-gray-700">
          <input type="checkbox" checked={staleOnly} onChange={(e) => setStaleOnly(e.target.checked)} />
          Stale only
        </label>
        {hasActiveFilters && (
          <button onClick={clearFilters} className="pb-1.5 text-xs text-slate-700 hover:underline">
            Clear filters
          </button>
        )}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-gray-500">
            Showing {filteredRequests.length} of {requests.length}
          </span>
          <button
            onClick={() => handleExport("csv")}
            disabled={filteredRequests.length === 0}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export CSV
          </button>
          <button
            onClick={() => handleExport("pdf")}
            disabled={filteredRequests.length === 0}
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Export PDF
          </button>
        </div>
      </div>

      {selectedIds.size > 0 && (
        <div className="mt-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2">
          <span className="text-sm font-medium text-blue-900">{selectedIds.size} selected</span>
          <button
            disabled={bulkActing}
            onClick={() => handleBulkVerify(true)}
            className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {bulkActing ? "Working..." : "Approve selected"}
          </button>
          <button
            disabled={bulkActing}
            onClick={() => handleBulkVerify(false)}
            className="rounded bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
          >
            {bulkActing ? "Working..." : "Reject selected"}
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-auto text-xs text-blue-700 hover:underline"
          >
            Clear selection
          </button>
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={
                      selectedIds.size > 0 &&
                      selectedIds.size === filteredRequests.filter((r) => r.status === "pending").length
                    }
                    onChange={toggleSelectAllPending}
                    disabled={filteredRequests.every((r) => r.status !== "pending")}
                  />
                </th>
                <th className="px-4 py-3">Priority</th>
                <th className="px-4 py-3">Victim</th>
                <th className="px-4 py-3">Disaster</th>
                <th className="px-4 py-3">Items requested</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">Affected</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Flags</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRequests.map((r) => (
                <tr
                  key={r.id}
                  className={
                    selectedIds.has(r.id) ? "bg-blue-50/50" : isStale(r) ? "bg-amber-50/60" : undefined
                  }
                >
                  <td className="px-4 py-3">
                    {r.status === "pending" && (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(r.id)}
                        onChange={() => toggleSelected(r.id)}
                      />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded bg-gray-900 px-2 py-1 text-xs font-semibold text-white">
                      {r.priorityScore?.toFixed(0)}
                    </span>
                  </td>
                  <td className="px-4 py-3">{r.victimName}</td>
                  <td className="px-4 py-3 capitalize">{r.disasterType}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.items || []).map((item) => (
                        <span
                          key={item.category}
                          className="rounded border border-gray-200 px-2 py-0.5 text-xs capitalize text-gray-600"
                        >
                          {item.category.replace("_", " ")} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 capitalize">{r.severity}</td>
                  <td className="px-4 py-3">{r.peopleAffected}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.possibleDuplicate && (
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                          ⚠ Possible duplicate household
                        </span>
                      )}
                      {(r.items || []).some((item) => item.category === "medicine") && (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-medium text-rose-800">
                          ⚕ Contains medicine — review
                        </span>
                      )}
                      {isStale(r) && (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                          ⏱ Stale ({staleAgeLabel(r)})
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setNotesFor(r)}
                      className="rounded border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Notes
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {r.status === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          disabled={actingOn === r.id}
                          onClick={() => handleVerify(r.id, true)}
                          className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          Approve
                        </button>
                        <button
                          disabled={actingOn === r.id}
                          onClick={() => handleVerify(r.id, false)}
                          className="rounded bg-red-100 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredRequests.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-8 text-center text-sm text-gray-500">
                    {requests.length === 0 ? "No requests yet." : "No requests match your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {notesFor && (
        <CaseNotesModal
          requestId={notesFor.id}
          victimName={notesFor.victimName}
          onClose={() => setNotesFor(null)}
        />
      )}
    </DashboardLayout>
  );
}
