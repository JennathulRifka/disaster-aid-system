import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";
import { nearestDistrict } from "@/lib/districts";

interface Donation {
  category: string;
  status: string;
  remainingQuantity?: number;
  quantityValue?: number;
  location?: { lat: number; lng: number };
}

interface CategoryLimit {
  label: string;
  unit: string;
}

// Live, per-district "what's actually available right now" view — the
// admin-facing half of the donation leftover-quantity feature (see
// "Donation leftover-quantity tracking & district inventory" in CLAUDE.md).
// Pure client-side derived state over an already-live onSnapshot listener,
// same architecture as ResourceGapView.tsx — admin already has full read
// access to `donations` via Firestore rules, so no new backend endpoint is
// needed for this half (unlike the donor-facing DonorDistrictNeed.tsx,
// which can't read other victims' aidRequests directly and needs a real
// aggregation route instead).
export default function AdminDistrictInventory() {
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/categories").then(setCategories);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((doc) => doc.data() as Donation));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const rows = useMemo(() => {
    const byKey: Record<string, { district: string; category: string; quantity: number; count: number }> = {};
    for (const d of donations) {
      // Donations created before this feature existed have neither field —
      // there's no real number to recover, so they correctly contribute 0
      // rather than appearing with a guessed quantity.
      const remaining = d.remainingQuantity ?? 0;
      const district = nearestDistrict(d.location);
      if (remaining <= 0 || !district) continue;
      const key = `${district}::${d.category}`;
      if (!byKey[key]) byKey[key] = { district, category: d.category, quantity: 0, count: 0 };
      byKey[key].quantity += remaining;
      byKey[key].count += 1;
    }
    return Object.values(byKey).sort((a, b) => b.quantity - a.quantity);
  }, [donations]);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">District Inventory</h1>
      <p className="mt-1 text-sm text-gray-600">
        Unallocated donation quantity by district and category, live — includes leftover from partial matches.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">District</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Available quantity</th>
                <th className="px-4 py-3">Donations</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={`${row.district}::${row.category}`}>
                  <td className="px-4 py-3">{row.district}</td>
                  <td className="px-4 py-3 capitalize">{categories[row.category]?.label || row.category}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {row.quantity} {categories[row.category]?.unit || ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.count}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    No unallocated donations right now.
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
