import { useEffect, useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Alert } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import type { VictimTabParamList } from "../../navigation/types";
import { apiFetch } from "../../lib/api";
import { nearestDistrict } from "../../lib/districts";

const DISASTER_TYPES = ["flood", "landslide", "cyclone", "drought", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const VULNERABLE_OPTIONS = ["children", "elderly", "pregnant women", "people with disabilities"];

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export function SubmitRequestScreen() {
  const { t } = useTranslation();
  const navigation = useNavigation<BottomTabNavigationProp<VictimTabParamList>>();
  const [categoryLimits, setCategoryLimits] = useState<Record<string, CategoryLimit>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [disasterType, setDisasterType] = useState("flood");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [severity, setSeverity] = useState("medium");
  const [peopleAffected, setPeopleAffected] = useState("1");
  const [vulnerableGroups, setVulnerableGroups] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [activeDistrictNames, setActiveDistrictNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    apiFetch("/api/categories")
      .then(setCategoryLimits)
      .finally(() => setCategoriesLoading(false));
    apiFetch("/api/active-districts").then((data: { district: string }[]) => {
      setActiveDistrictNames(new Set(data.map((d) => d.district)));
    });
  }, []);

  const categoryKeys = Object.keys(categoryLimits);
  const detectedDistrict = location ? nearestDistrict(location) : null;
  const districtIsActive = detectedDistrict ? activeDistrictNames.has(detectedDistrict) : false;

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

  function toggleVulnerable(group: string) {
    setVulnerableGroups((prev) => (prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]));
  }

  function toggleCategory(category: string) {
    setQuantities((prev) => {
      const next = { ...prev };
      if (category in next) {
        delete next[category];
      } else {
        next[category] = 1;
      }
      return next;
    });
  }

  function setQuantity(category: string, value: number) {
    const max = categoryLimits[category].max;
    const clamped = max === null ? Math.max(value, 1) : Math.min(Math.max(value, 1), max);
    setQuantities((prev) => ({ ...prev, [category]: clamped }));
  }

  async function handleSubmit() {
    setError("");
    if (!location) {
      setError(t("victimRequestForm.locationError"));
      return;
    }
    const items = Object.entries(quantities).map(([category, quantity]) => ({ category, quantity }));
    if (items.length === 0) {
      setError(t("victimRequestForm.selectAtLeastOne", "Select at least one item you need."));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/requests", {
        method: "POST",
        body: JSON.stringify({
          disasterType,
          items,
          severity,
          peopleAffected: Number(peopleAffected) || 1,
          vulnerableGroups,
          location,
          notes,
        }),
      });
      Alert.alert("Request submitted", "Your aid request has been submitted for review.");
      setQuantities({});
      setNotes("");
      navigation.navigate("MyRequests");
    } catch (err: any) {
      setError(err.message || t("victimRequestForm.submitFailed", "Failed to submit request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("victimRequestForm.title")}</Text>
      <Text className="mt-1 text-sm text-gray-600">{t("victimRequestForm.subtitle")}</Text>

      <View className="mt-6 rounded-xl bg-white p-5 shadow-sm" style={{ gap: 20 }}>
        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("victimRequestForm.disasterType")}</Text>
          <View className="rounded border border-gray-300">
            <Picker selectedValue={disasterType} onValueChange={setDisasterType}>
              {DISASTER_TYPES.map((type) => (
                <Picker.Item key={type} label={t(`disasterTypes.${type}`)} value={type} />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("victimRequestForm.severity")}</Text>
          <View className="rounded border border-gray-300">
            <Picker selectedValue={severity} onValueChange={setSeverity}>
              {SEVERITIES.map((s) => (
                <Picker.Item key={s} label={t(`severities.${s}`)} value={s} />
              ))}
            </Picker>
          </View>
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700">{t("victimRequestForm.whatDoYouNeed")}</Text>
          {categoriesLoading ? (
            <ActivityIndicator />
          ) : (
            <View style={{ gap: 8 }}>
              {categoryKeys.map((category) => {
                const limit = categoryLimits[category];
                const selected = category in quantities;
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
                        {t(`categories.${category}`, limit.label)}{" "}
                        <Text className="text-xs text-gray-400">
                          {limit.max === null
                            ? `(${limit.unit}, ${t("victimRequestForm.noFixedCap")})`
                            : `(${t("victimRequestForm.upTo")} ${limit.max} ${limit.unit})`}
                        </Text>
                      </Text>
                    </TouchableOpacity>
                    {selected && (
                      <TextInput
                        keyboardType="number-pad"
                        value={String(quantities[category])}
                        onChangeText={(v) => setQuantity(category, Number(v) || 1)}
                        className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                      />
                    )}
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("victimRequestForm.peopleAffected")}</Text>
          <TextInput
            keyboardType="number-pad"
            value={peopleAffected}
            onChangeText={setPeopleAffected}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </View>

        <View>
          <Text className="mb-2 text-sm font-medium text-gray-700">{t("victimRequestForm.vulnerableGroups")}</Text>
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            {VULNERABLE_OPTIONS.map((group) => {
              const selected = vulnerableGroups.includes(group);
              return (
                <TouchableOpacity
                  key={group}
                  onPress={() => toggleVulnerable(group)}
                  className={`rounded-full border px-3 py-1 ${
                    selected ? "border-orange-600 bg-orange-50" : "border-gray-300"
                  }`}
                >
                  <Text className={`text-xs font-medium ${selected ? "text-orange-700" : "text-gray-600"}`}>
                    {t(`vulnerableGroups.${group}`)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("victimRequestForm.location")}</Text>
          <TouchableOpacity
            onPress={captureLocation}
            className="items-start rounded border border-gray-300 px-3 py-2"
          >
            <Text className="text-sm font-medium text-gray-700">
              {locationStatus === "capturing"
                ? "..."
                : locationStatus === "captured"
                  ? t("victimRequestForm.locationCaptured")
                  : t("victimRequestForm.captureLocation")}
            </Text>
          </TouchableOpacity>
          {locationStatus === "error" && (
            <Text className="mt-1 text-xs text-red-600">{t("victimRequestForm.locationError")}</Text>
          )}
          {locationStatus === "captured" && detectedDistrict && !districtIsActive && (
            <Text className="mt-2 text-xs text-amber-700">
              {t(
                "victimRequestForm.noActiveEmergencyNote",
                "No declared emergency currently active in your area — your request will still be reviewed."
              )}
            </Text>
          )}
        </View>

        <View>
          <Text className="mb-1 text-sm font-medium text-gray-700">{t("victimRequestForm.notes")}</Text>
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
          disabled={submitting}
          className="items-center rounded bg-orange-600 py-3"
          style={{ opacity: submitting ? 0.5 : 1 }}
        >
          {submitting ? (
            <ActivityIndicator color="white" />
          ) : (
            <Text className="font-medium text-white">{t("victimRequestForm.submitButton")}</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
