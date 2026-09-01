import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";
import { DISTRICTS } from "@/lib/districts";

interface ActiveDistrict {
  id: string;
  district: string;
  activatedAt: string;
  activatedByName: string;
  sourceAlertTitle: string | null;
}

export default function AdminActiveDistricts() {
  const [active, setActive] = useState<ActiveDistrict[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "activeDistricts"), (snapshot) => {
      setActive(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as ActiveDistrict));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const activeByName = new Map(active.map((a) => [a.district, a]));

  async function activate(district: string) {
    setActingOn(district);
    try {
      await apiFetch("/api/active-districts", {
        method: "POST",
        body: JSON.stringify({ district }),
      });
    } finally {
      setActingOn(null);
    }
  }

  async function deactivate(district: string) {
    setActingOn(district);
    try {
      await apiFetch(`/api/active-districts/${encodeURIComponent(district)}`, { method: "DELETE" });
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Active Emergency Districts</h1>
      <p className="mt-1 text-sm text-gray-600">
        Mark specific districts as an active emergency — Sri Lanka's disasters are usually localized, so this
        is per-district, not a single system-wide switch. Victim submissions are never blocked either way;
        this only drives the soft in-area note and the public emergency banner.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Activated by</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {DISTRICTS.map((d) => {
                const record = activeByName.get(d.name);
                const isActive = Boolean(record);
                return (
                  <tr key={d.name} className={isActive ? "bg-red-50/50" : undefined}>
                    <td className="px-4 py-3 font-medium text-gray-900">{d.name}</td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                          Active emergency
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-500">{record?.activatedByName || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {record?.sourceAlertTitle || (isActive ? "Manual" : "—")}
                    </td>
                    <td className="px-4 py-3">
                      {isActive ? (
                        <button
                          disabled={actingOn === d.name}
                          onClick={() => deactivate(d.name)}
                          className="rounded bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                        >
                          Deactivate
                        </button>
                      ) : (
                        <button
                          disabled={actingOn === d.name}
                          onClick={() => activate(d.name)}
                          className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Mark active
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
