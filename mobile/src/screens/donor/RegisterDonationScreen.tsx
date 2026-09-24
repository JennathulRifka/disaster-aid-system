import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from "react-native";
import * as Location from "expo-location";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { useTranslation } from "react-i18next";
import type { DonorTabParamList } from "../../navigation/types";
import { apiFetch } from "../../lib/api";

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export function RegisterDonationScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<DonorTabParamList>>();
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [items, setItems] = useState<Record<string, string>>({});
  // Free-text `items` above stays the display label ("50 kg rice") —
  // unchanged. `itemAmounts` is the new real-number field the
  // district-inventory feature needs (see "Donation leftover-quantity
  // tracking" in CLAUDE.md).
  const [itemAmounts, setItemAmounts] = useState<Record<string, string>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<"self" | "volunteer">("volunteer");
  const [notes, setNotes] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch("/api/categories")
      .then(setCategories)
      .finally(() => setCategoriesLoading(false));
  }, []);

  const categoryKeys = Object.keys(categories);

  function toggleCategory(category: string) {
    setItems((prev) => {
      const next = { ...prev };
      if (category in next) {
        delete next[category];
      } else {
        next[category] = "";
      }
      return next;
    });
    setItemAmounts((prev) => {
      const next = { ...prev };
      if (category in next) delete next[category];
      else next[category] = "";
      return next;
    });
  }

  function setItemQuantity(category: string, value: string) {
    setItems((prev) => ({ ...prev, [category]: value }));
  }

  function setItemAmount(category: string, value: string) {
    setItemAmounts((prev) => ({ ...prev, [category]: value }));
  }

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
      setError(t("donorDonationForm.errorNoLocation"));
      return;
    }
    const selectedCategories = Object.keys(items);
    if (selectedCategories.length === 0) {
      setError(t("donorDonationForm.selectAtLeastOne"));
      return;
    }
    if (selectedCategories.some((category) => !items[category].trim())) {
      setError(t("donorDonationForm.errorNoQuantity"));
      return;
    }
    if (selectedCategories.some((category) => !(Number(itemAmounts[category]) > 0))) {
      setError(t("donorDonationForm.errorNoAmount"));
      return;
    }
    setSubmitting(true);
    try {
      // One donation per selected category, sharing the same pickup
      // location/delivery method/notes — matches web's DonorDonationForm.tsx
      // and the app's existing single-category-per-donation data model.
      const results = await Promise.allSettled(
        selectedCategories.map((category) =>
          apiFetch("/api/donations", {
            method: "POST",
            body: JSON.stringify({
              category,
              quantity: items[category].trim(),
              quantityValue: Number(itemAmounts[category]),
              location,
              deliveryMethod,
              notes,
            }),
          })
        )
      );
      const anyFailed = results.some((r) => r.status === "rejected");
      if (anyFailed && results.every((r) => r.status === "rejected")) {
        throw (results[0] as PromiseRejectedResult).reason;
      }
      if (anyFailed) {
        // Keep only the categories that actually failed, so the donor can
        // retry just those instead of re-entering everything.
        const failedCategories = new Set(
          selectedCategories.filter((_, i) => results[i].status === "rejected")
        );
        setItems((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([category]) => failedCategories.has(category)))
        );
        setItemAmounts((prev) =>
          Object.fromEntries(Object.entries(prev).filter(([category]) => failedCategories.has(category)))
        );
        setError(t("donorDonationForm.errorPartial"));
      } else {
        setItems({});
        setItemAmounts({});
        setNotes("");
        setLocation(null);
        setLocationStatus("idle");
        navigation.navigate("MyDonations");
      }
    } catch (err: any) {
      setError(err.message || t("donorDonationForm.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("donorDonationForm.title")}</Text>
      <Text className="mt-1 text-sm text-gray-600">{t("donorDonationForm.subtitle")}</Text>

      <View className="mt-6 rounded-xl bg-white p-5 shadow-sm" style={{ gap: 20 }}>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("donorDonationForm.whatAreYouDonating")}</Text>
          <Text className="mb-2 text-xs text-gray-500">{t("donorDonationForm.whatAreYouDonatingHint")}</Text>
          {categoriesLoading ? (
            <ActivityIndicator />
          ) : (
            <View style={{ gap: 8 }}>
              {categoryKeys.map((category) => {
                const c = categories[category];
                const selected = category in items;
                return (
                  <View
                    key={category}
                    className={`flex-row items-center justify-between rounded border px-3 py-2 ${
                      selected ? "border-orange-600 bg-orange-50" : "border-gray-300"
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => toggleCategory(category)}
                      className="flex-1 flex-row items-center"
                      style={{ gap: 8 }}
                    >
                      <View
                        className={`h-5 w-5 items-center justify-center rounded border ${
                          selected ? "border-orange-600 bg-orange-600" : "border-gray-400"
                        }`}
                      >
                        {selected && <Text className="text-xs font-bold text-white">✓</Text>}
                      </View>
                      <Text className="flex-1 text-sm text-gray-700">
                        {t(`categories.${category}`, { defaultValue: c.label })}
                      </Text>
                    </TouchableOpacity>
                    {selected && (
                      <View className="flex-row" style={{ gap: 6 }}>
                        <TextInput
                          value={items[category]}
                          onChangeText={(v) => setItemQuantity(category, v)}
                          placeholder={t("donorDonationForm.quantityPlaceholder")}
                          className="w-24 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                        <TextInput
                          value={itemAmounts[category] ?? ""}
                          onChangeText={(v) => setItemAmount(category, v)}
                          placeholder={t("donorDonationForm.amountPlaceholder")}
                          keyboardType="numeric"
                          accessibilityLabel={t("donorDonationForm.amountPlaceholder")}
                          className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700">{t("donorDonationForm.deliveryMethodLabel")}</Text>
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
                {t("donorDonationForm.findVolunteer")}
              </Text>
              <Text className="text-xs text-gray-500">{t("donorDonationForm.findVolunteerDesc")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setDeliveryMethod("self")}
              className={`rounded border px-3 py-2 ${
                deliveryMethod === "self" ? "border-orange-600 bg-orange-50" : "border-gray-300"
              }`}
            >
              <Text className={`font-medium ${deliveryMethod === "self" ? "text-orange-700" : "text-gray-700"}`}>
                {t("donorDonationForm.selfDeliver")}
              </Text>
              <Text className="text-xs text-gray-500">{t("donorDonationForm.selfDeliverDesc")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("donorDonationForm.pickupLocation")}</Text>
          <TouchableOpacity onPress={captureLocation} className="items-start rounded border border-gray-300 px-3 py-2">
            <Text className="text-sm font-medium text-gray-700">
              {locationStatus === "capturing"
                ? t("donorDonationForm.capturingLocation")
                : locationStatus === "captured"
                  ? t("donorDonationForm.locationCaptured")
                  : t("donorDonationForm.captureLocation")}
            </Text>
          </TouchableOpacity>
          {locationStatus === "error" && (
            <Text className="mt-1 text-xs text-red-600">{t("donorDonationForm.locationError")}</Text>
          )}
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("donorDonationForm.notes")}</Text>
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
            <Text className="font-medium text-white">{t("donorDonationForm.registerButton")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
