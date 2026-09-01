import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useAuth } from "../../context/AuthContext";
import { StatCard } from "../../components/StatCard";

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

export function OverviewScreen() {
  const { profile } = useAuth();
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

  const ready = loaded.requests && loaded.donations && loaded.deliveries;

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
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Welcome, {profile?.name}</Text>
      <Text className="mt-1 text-sm capitalize text-gray-600">Logged in as {profile?.role}</Text>

      {!ready ? (
        <ActivityIndicator size="large" color="#ea580c" style={{ marginTop: 24 }} />
      ) : (
        <View className="mt-6 flex-row flex-wrap justify-between" style={{ rowGap: 12 }}>
          <StatCard label="Pending requests" value={pendingRequests} />
          <StatCard label="Unmatched donations" value={unmatchedDonations} />
          <StatCard label="Active deliveries" value={activeDeliveries} />
          <StatCard label="Avg. time to verification" value={avgVerification} />
        </View>
      )}
    </ScrollView>
  );
}
