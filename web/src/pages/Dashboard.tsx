import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatCard } from "@/components/StatCard";
import { useAuth } from "@/context/AuthContext";
import { db } from "@/lib/firebase";

const QUICK_LINKS: Record<string, { label: string; path: string; desc: string }[]> = {
  victim: [
    { label: "Submit a new aid request", path: "/request/new", desc: "Report what you need and where." },
    { label: "View my requests", path: "/request/mine", desc: "Track status and priority." },
  ],
  donor: [
    { label: "Register a donation", path: "/donations/new", desc: "Offer resources for matching." },
    { label: "View my donations", path: "/donations/mine", desc: "See what's been matched or delivered." },
  ],
  admin: [
    { label: "Review aid requests", path: "/admin/requests", desc: "Verify and prioritize incoming requests." },
    { label: "Manage donations", path: "/admin/donations", desc: "Match donations to verified requests." },
  ],
  volunteer: [
    { label: "My deliveries", path: "/deliveries/mine", desc: "See assignments and update progress." },
  ],
};

const ACTIVE_DELIVERY_STATUSES = ["pending_acceptance", "accepted", "picked_up"];

interface AidRequestKpi {
  status: string;
  createdAt: string;
  verifiedAt?: string;
}

function formatDuration(ms: number) {
  const minutes = ms / 60_000;
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours.toFixed(1)} hrs`;
  return `${(hours / 24).toFixed(1)} days`;
}

function AdminKpiRow() {
  const [requests, setRequests] = useState<AidRequestKpi[]>([]);
  const [donations, setDonations] = useState<{ status: string }[]>([]);
  const [deliveries, setDeliveries] = useState<{ status: string }[]>([]);
  const [loaded, setLoaded] = useState({ requests: false, donations: false, deliveries: false });

  useEffect(() => {
    const unsubRequests = onSnapshot(collection(db, "aidRequests"), (snapshot) => {
      setRequests(snapshot.docs.map((doc) => doc.data() as AidRequestKpi));
      setLoaded((l) => ({ ...l, requests: true }));
    });
    const unsubDonations = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((doc) => doc.data() as { status: string }));
      setLoaded((l) => ({ ...l, donations: true }));
    });
    const unsubDeliveries = onSnapshot(collection(db, "deliveries"), (snapshot) => {
      setDeliveries(snapshot.docs.map((doc) => doc.data() as { status: string }));
      setLoaded((l) => ({ ...l, deliveries: true }));
    });
    return () => {
      unsubRequests();
      unsubDonations();
      unsubDeliveries();
    };
  }, []);

  if (!loaded.requests || !loaded.donations || !loaded.deliveries) {
    return <p className="mt-6 text-sm text-gray-500">Loading KPIs...</p>;
  }

  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const unmatchedDonations = donations.filter((d) => d.status === "available").length;
  const activeDeliveries = deliveries.filter((d) => ACTIVE_DELIVERY_STATUSES.includes(d.status)).length;

  const verificationDurationsMs = requests
    .filter((r) => r.verifiedAt)
    .map((r) => new Date(r.verifiedAt as string).getTime() - new Date(r.createdAt).getTime());
  const avgVerification =
    verificationDurationsMs.length === 0
      ? "—"
      : formatDuration(verificationDurationsMs.reduce((a, b) => a + b, 0) / verificationDurationsMs.length);

  return (
    <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard label="Pending requests" value={pendingRequests} />
      <StatCard label="Unmatched donations" value={unmatchedDonations} />
      <StatCard label="Active deliveries" value={activeDeliveries} />
      <StatCard label="Avg. time to verification" value={avgVerification} />
    </div>
  );
}

export default function Dashboard() {
  const { profile } = useAuth();
  const links = profile ? QUICK_LINKS[profile.role] || [] : [];

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">Welcome, {profile?.name}</h1>
      <p className="mt-1 text-sm text-gray-600 capitalize">Logged in as {profile?.role}</p>

      {profile?.role === "admin" && <AdminKpiRow />}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {links.map((link) => (
          <Link
            key={link.path}
            to={link.path}
            className="rounded-xl border border-gray-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm"
          >
            <p className="font-medium text-gray-900">{link.label}</p>
            <p className="mt-1 text-sm text-gray-500">{link.desc}</p>
          </Link>
        ))}
      </div>
    </DashboardLayout>
  );
}
