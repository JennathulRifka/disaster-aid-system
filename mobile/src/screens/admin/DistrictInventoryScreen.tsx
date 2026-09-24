import { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator } from "react-native";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { nearestDistrict } from "../../lib/districts";

interface Donation {
  category: string;
  status: string;
  remainingQuantity?: number;
  location?: { lat: number; lng: number };
}

interface CategoryLimit {
  label: string;
  unit: string;
}

// Live, per-district "what's actually available right now" view — the
// admin-facing half of the donation leftover-quantity feature (see
// "Donation leftover-quantity tracking & district inventory" in CLAUDE.md).
// Mirrors web's AdminDistrictInventory.tsx exactly: pure client-side
// derived state over an already-live onSnapshot listener, same pattern as
// AidRequestsScreen.tsx/DonationsScreen.tsx already use — admin already has
// full read access to `donations` via Firestore rules, no new backend
// endpoint needed for this half.
export function DistrictInventoryScreen() {
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [donations, setDonations] = useState<Donation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch("/api/categories").then(setCategories);
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((d) => d.data() as Donation));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const rows = useMemo(() => {
    const byKey: Record<string, { district: string; category: string; quantity: number; count: number }> = {};
    for (const d of donations) {
      // Donations created before this feature existed have no
      // remainingQuantity at all — no real number to recover, so they
      // correctly contribute 0 rather than a guessed amount.
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

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">District Inventory</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Unallocated donation quantity by district and category, live.
      </Text>

      {rows.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No unallocated donations right now.</Text>
      ) : (
        <View className="mt-4" style={{ gap: 10 }}>
          {rows.map((row) => (
            <View key={`${row.district}::${row.category}`} className="rounded-xl border border-gray-200 bg-white p-4">
              <Text className="text-sm font-semibold text-gray-900">{row.district}</Text>
              <View className="mt-1 flex-row items-center justify-between">
                <Text className="text-xs capitalize text-gray-600">
                  {categories[row.category]?.label || row.category}
                </Text>
                <Text className="text-sm font-medium text-gray-900">
                  {row.quantity} {categories[row.category]?.unit || ""}
                </Text>
              </View>
              <Text className="mt-1 text-xs text-gray-400">
                {row.count} donation{row.count === 1 ? "" : "s"}
              </Text>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
