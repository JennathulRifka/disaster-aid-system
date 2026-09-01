import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { DonorTabParamList } from "../../navigation/types";
import { apiFetch } from "../../lib/api";

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export function RegisterDonationScreen() {
  const navigation = useNavigation<BottomTabNavigationProp<DonorTabParamList>>();
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"self" | "volunteer">("volunteer");
  const [notes, setNotes] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/categories")
      .then((data: Record<string, CategoryLimit>) => {
        setCategories(data);
        const firstKey = Object.keys(data)[0];
        if (firstKey) setCategory(firstKey);
      })
      .finally(() => setCategoriesLoading(false));
  }, []);

  async function captureLocation() {
    setLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setLocationStatus("captured");
    } catch {
      setLocationStatus("error");
    }
  }

  async function handleSubmit() {
    setError("");
    if (!location) {
      setError("Please capture a pickup location before submitting.");
      return;
    }
    if (!quantity) {
      setError("Please enter a quantity.");
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/donations", {
        method: "POST",
        body: JSON.stringify({ category, quantity, location, deliveryMethod, notes }),
      });
      setQuantity("");
      setNotes("");
      setLocation(null);
      setLocationStatus("idle");
      navigation.navigate("MyDonations");
    } catch (err: any) {
      setError(err.message || "Failed to register donation.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">Register a Donation</Text>
      <Text className="mt-1 text-sm text-gray-600">
        Tell us what you're able to give — we'll match it to a verified request nearby.
      </Text>

      <View className="mt-6 rounded-xl bg-white p-5 shadow-sm" style={{ gap: 20 }}>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Category</Text>
          {categoriesLoading ? (
            <ActivityIndicator />
          ) : (
            <View className="rounded border border-gray-300">
              <Picker selectedValue={category} onValueChange={setCategory}>
                {Object.entries(categories).map(([key, c]) => (
                  <Picker.Item key={key} label={c.label} value={key} />
                ))}
              </Picker>
            </View>
          )}
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Quantity (e.g. "50 kg rice")</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="50 kg rice"
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700">How will this reach the recipient?</Text>
          <View style={{ gap: 8 }}>
            <TouchableOpacity
              onPress={() => setDeliveryMethod("volunteer")}
              className={`rounded border px-3 py-2 ${
                deliveryMethod === "volunteer" ? "border-orange-600 bg-orange-50" : "border-gray-300"
              }`}
            >
              <Text
                className={`font-medium ${deliveryMethod === "volunteer" ? "text-orange-700" : "text-gray-700"}`}
              >
                Find a volunteer
              </Text>
              <Text className="text-xs text-gray-500">A volunteer picks up and delivers it.</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeliveryMethod("self")}
              className={`rounded border px-3 py-2 ${
                deliveryMethod === "self" ? "border-orange-600 bg-orange-50" : "border-gray-300"
              }`}
            >
              <Text className={`font-medium ${deliveryMethod === "self" ? "text-orange-700" : "text-gray-700"}`}>
                I'll deliver it myself
              </Text>
              <Text className="text-xs text-gray-500">You mark it delivered once it's dropped off.</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Pickup location</Text>
          <TouchableOpacity onPress={captureLocation} className="items-start rounded border border-gray-300 px-3 py-2">
            <Text className="text-sm font-medium text-gray-700">
              {locationStatus === "capturing"
                ? "Capturing..."
                : locationStatus === "captured"
                  ? "Location captured ✓"
                  : "Capture my current location"}
            </Text>
          </TouchableOpacity>
          {locationStatus === "error" && (
            <Text className="mt-1 text-xs text-red-600">
              Couldn't get your location — check location permissions and try again.
            </Text>
          )}
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
            style={{ textAlignVertical: "top" }}
          />
        </View>

        {error ? <Text className="text-sm text-red-600">{error}</Text> : null}

        <TouchableOpacity
          onPress={handleSubmit}
          disabled={submitting || categoriesLoading}
          className="items-center rounded bg-orange-600 py-3"
          style={{ opacity: submitting || categoriesLoading ? 0.5 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-medium text-white">Register Donation</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
