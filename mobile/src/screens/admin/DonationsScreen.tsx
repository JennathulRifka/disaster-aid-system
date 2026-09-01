import { useEffect, useState } from "react";
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity } from "react-native";
import { Picker } from "@react-native-picker/picker";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { apiFetch } from "../../lib/api";
import { StatusBadge } from "../../components/StatusBadge";

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

interface Volunteer {
  uid: string;
  name: string;
  available?: boolean;
}

// Simplified mobile admin view — same "auto-assign, manual reassign as
// override" flow as AdminDonations.tsx on web, see "Automatic volunteer
// assignment" in CLAUDE.md. Desktop-only conveniences (CSV/PDF export,
// period filter) stay web-only.
export function DonationsScreen() {
  const [donations, setDonations] = useState<Donation[]>([]);
  const [volunteers, setVolunteers] = useState<Volunteer[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [selectedVolunteer, setSelectedVolunteer] = useState<Record<string, string>>({});

  useEffect(() => {
    apiFetch("/api/users/volunteers").then(setVolunteers);
  }, []);

  const availableVolunteers = volunteers.filter((v) => v.available !== false);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "donations"), (snapshot) => {
      setDonations(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }) as Donation));
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
          : base
      );
    } catch (err: any) {
      setMessage(err.message || "No matching request found.");
    } finally {
      setActingOn(null);
    }
  }

  async function handleAssignVolunteer(donation: Donation, isReassign: boolean) {
    const volunteerId = selectedVolunteer[donation.id];
    if (!volunteerId || !donation.matchedRequestId) return;
    setActingOn(donation.id);
    setMessage("");
    try {
      await apiFetch("/api/deliveries", {
        method: "POST",
        body: JSON.stringify({ requestId: donation.matchedRequestId, donationId: donation.id, volunteerId }),
      });
      setMessage(isReassign ? "Reassigned." : "Volunteer assigned.");
    } catch (err: any) {
      setMessage(err.message || "Failed to assign volunteer.");
    } finally {
      setActingOn(null);
    }
  }

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-gray-50">
        <ActivityIndicator size="large" color="#ea580c" />
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Donations</Text>

      {message ? (
        <View className="mt-3 rounded border border-blue-200 bg-blue-50 px-3 py-2">
          <Text className="text-sm text-blue-800">{message}</Text>
        </View>
      ) : null}

      {donations.length === 0 ? (
        <Text className="mt-4 text-sm text-gray-500">No donations yet.</Text>
      ) : (
        <View className="mt-4" style={{ gap: 12 }}>
          {donations.map((d) => (
            <View key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <View className="flex-row items-start justify-between">
                <View className="flex-1 pr-2">
                  <Text className="text-sm font-medium capitalize text-gray-900">
                    {d.category} — {d.quantity}
                  </Text>
                  <Text className="text-xs text-gray-500">
                    {d.donorName} · {d.deliveryMethod === "self" ? "Self-delivery" : "Volunteer"}
                  </Text>
                </View>
                <StatusBadge status={d.status} />
              </View>

              <View className="mt-3">
                {d.status === "available" && (
                  <TouchableOpacity
                    disabled={actingOn === d.id}
                    onPress={() => handleMatch(d.id)}
                    className="self-start rounded bg-orange-600 px-3 py-1.5"
                    style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                  >
                    <Text className="text-xs font-medium text-white">Find match</Text>
                  </TouchableOpacity>
                )}

                {d.status === "matched" && d.deliveryMethod === "self" && (
                  <Text className="text-xs font-medium text-green-700">Donor self-delivering ✓</Text>
                )}

                {d.status === "matched" && d.deliveryMethod === "volunteer" && !d.assignedDeliveryId && (
                  <View style={{ gap: 6 }}>
                    <Text className="text-xs text-amber-700">
                      No auto-assign match (no available volunteer with a location set).
                    </Text>
                    {d.lastRejectionReason !== undefined && d.lastRejectionReason !== null && (
                      <Text className="text-xs text-red-600">
                        Previous volunteer rejected
                        {d.lastRejectionReason ? `: "${d.lastRejectionReason}"` : " (no reason given)"}
                      </Text>
                    )}
                    {availableVolunteers.length === 0 ? (
                      <Text className="text-xs text-gray-400">No volunteers currently available.</Text>
                    ) : (
                      <>
                        <View className="rounded border border-gray-300">
                          <Picker
                            selectedValue={selectedVolunteer[d.id] || ""}
                            onValueChange={(v) => setSelectedVolunteer((prev) => ({ ...prev, [d.id]: v }))}
                          >
                            <Picker.Item label="Select volunteer..." value="" />
                            {availableVolunteers.map((v) => (
                              <Picker.Item key={v.uid} label={v.name} value={v.uid} />
                            ))}
                          </Picker>
                        </View>
                        <TouchableOpacity
                          disabled={actingOn === d.id}
                          onPress={() => handleAssignVolunteer(d, false)}
                          className="self-start rounded bg-purple-600 px-3 py-1.5"
                          style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                        >
                          <Text className="text-xs font-medium text-white">Assign</Text>
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                )}

                {d.status === "matched" &&
                  d.deliveryMethod === "volunteer" &&
                  d.assignedDeliveryId &&
                  d.deliveryStatus === "pending_acceptance" && (
                    <View style={{ gap: 6 }}>
                      <Text className="text-xs font-medium text-gray-600">Awaiting volunteer response...</Text>
                      {availableVolunteers.length > 0 && (
                        <>
                          <View className="rounded border border-gray-300">
                            <Picker
                              selectedValue={selectedVolunteer[d.id] || ""}
                              onValueChange={(v) => setSelectedVolunteer((prev) => ({ ...prev, [d.id]: v }))}
                            >
                              <Picker.Item label="Reassign to..." value="" />
                              {availableVolunteers.map((v) => (
                                <Picker.Item key={v.uid} label={v.name} value={v.uid} />
                              ))}
                            </Picker>
                          </View>
                          <TouchableOpacity
                            disabled={actingOn === d.id}
                            onPress={() => handleAssignVolunteer(d, true)}
                            className="self-start rounded border border-gray-300 px-3 py-1.5"
                            style={{ opacity: actingOn === d.id ? 0.5 : 1 }}
                          >
                            <Text className="text-xs font-medium text-gray-700">Reassign</Text>
                          </TouchableOpacity>
                        </>
                      )}
                    </View>
                  )}

                {d.status === "matched" &&
                  d.deliveryMethod === "volunteer" &&
                  d.assignedDeliveryId &&
                  d.deliveryStatus !== "pending_acceptance" && (
                    <Text className="text-xs font-medium text-gray-600">Volunteer assigned ✓</Text>
                  )}
              </View>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}
