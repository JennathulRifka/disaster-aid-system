import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { db } from "@/lib/firebase";

interface Volunteer {
  uid: string;
  name: string;
  email: string;
  available?: boolean;
}

interface Delivery {
  volunteerId: string | null;
  status: string;
}

const ACTIVE_STATUSES = ["pending_acceptance", "accepted", "picked_up"];
const COMPLETED_STATUSES = ["delivered", "confirmed"];

export default function VolunteerWorkload() {
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/users/volunteers").then(setVolunteers);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "deliveries"), (snapshot) => {
      setDeliveries(snapshot.docs.map((doc) => doc.data() as Delivery));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const rows = useMemo(() => {
    return volunteers
      .map((v) => {
        const mine = deliveries.filter((d) => d.volunteerId === v.uid);
        const active = mine.filter((d) => ACTIVE_STATUSES.includes(d.status)).length;
        const completed = mine.filter((d) => COMPLETED_STATUSES.includes(d.status)).length;
        const rejected = mine.filter((d) => d.status === "rejected").length;
        return { ...v, active, completed, rejected, total: mine.length };
      })
      .sort((a, b) => b.active - a.active || b.total - a.total);
  }, [volunteers, deliveries]);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Volunteer Workload</h1>
      <p className="mt-1 text-sm text-gray-600">
        Active deliveries per volunteer, busiest first — so no one gets overloaded while others sit idle.
      </p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Volunteer</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Availability</th>
                <th className="px-4 py-3">Active</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3">Rejected</th>
                <th className="px-4 py-3">Total assigned</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((v) => (
                <tr key={v.uid}>
                  <td className="px-4 py-3">{v.name}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{v.email}</td>
                  <td className="px-4 py-3">
                    {v.available !== false ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                        Available
                      </span>
                    ) : (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Unavailable
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {v.active === 0 ? (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                        Idle
                      </span>
                    ) : v.active >= 3 ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        {v.active} — High load
                      </span>
                    ) : (
                      <span className="font-medium text-gray-900">{v.active}</span>
                    )}
                  </td>
                  <td className="px-4 py-3">{v.completed}</td>
                  <td className="px-4 py-3">{v.rejected}</td>
                  <td className="px-4 py-3 text-gray-500">{v.total}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-500">
                    No volunteers registered yet.
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
