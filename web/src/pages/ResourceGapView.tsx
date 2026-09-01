import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";

interface RequestItem {
  category: string;
  status: string;
}

interface AidRequest {
  items: RequestItem[];
}

interface Donation {
  category: string;
  status: string;
}

interface CategoryLimit {
  label: string;
  unit: string;
}

export default function ResourceGapView() {
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/categories").then(setCategories);
  }, []);

  useEffect(() => {
    const unsubRequests = onSnapshot(collection(db, "aidRequests"), (snapshot) => {
      setRequests(snapshot.docs.map((doc) => doc.data() as AidRequest));
      setLoading(false);
    });
    const unsubDonations = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((doc) => doc.data() as Donation));
    });
    return () => {
      unsubRequests();
      unsubDonations();
    };
  }, []);

  const rows = useMemo(() => {
    return Object.entries(categories)
      .map(([key, cat]) => {
        const pending = requests.reduce(
          (sum, r) => sum + (r.items || []).filter((item) => item.category === key && item.status === "pending").length,
          0
        );
        const available = donations.filter((d) => d.category === key && d.status === "available").length;
        return { key, label: cat.label, unit: cat.unit, pending, available, gap: pending - available };
      })
      .sort((a, b) => b.gap - a.gap);
  }, [categories, requests, donations]);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Resource Gap</h1>
      <p className="mt-1 text-sm text-gray-600">
        Pending requests vs. available donations per category — the biggest shortages float to the top.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Pending requests</th>
                <th className="px-4 py-3">Available donations</th>
                <th className="px-4 py-3">Gap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.key}>
                  <td className="px-4 py-3">{row.label}</td>
                  <td className="px-4 py-3">{row.pending}</td>
                  <td className="px-4 py-3">{row.available}</td>
                  <td className="px-4 py-3">
                    {row.gap > 0 ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Short by {row.gap}
                      </span>
                    ) : row.pending === 0 && row.available === 0 ? (
                      <span className="text-xs text-gray-400">No activity</span>
                    ) : (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Covered
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No categories configured yet.
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
