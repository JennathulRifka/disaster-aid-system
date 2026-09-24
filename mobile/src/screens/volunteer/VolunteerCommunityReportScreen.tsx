import { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput } from "react-native";
import { Picker } from "@react-native-picker/picker";
import * as Location from "expo-location";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { apiFetch } from "../../lib/api";

function reportTypeLabel(t: TFunction): Record<string, string> {
  return {
    road_closure: t("volunteerCommunityReport.reportType.road_closure"),
    water_level: t("volunteerCommunityReport.reportType.water_level"),
    other: t("volunteerCommunityReport.reportType.other"),
  };
}

// Lifted verbatim out of MyDeliveriesScreen.tsx into its own Home-tile
// destination — direct user ask: the report form was crowding a page whose
// real job is tracking delivery status (the exact same "doesn't look good
// in my deliveries" complaint web's VolunteerCommunityReport.tsx already
// fixed once — see CLAUDE.md). Same form/state/submit logic, no behavior
// change, just relocated.
export function VolunteerCommunityReportScreen() {
  const { t } = useTranslation();
  const [reportType, setReportType] = useState<"road_closure" | "water_level" | "other">("road_closure");
  const [reportDescription, setReportDescription] = useState("");
  const [reportLocation, setReportLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [reportLocationStatus, setReportLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">(
    "idle"
  );
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportSent, setReportSent] = useState(false);
  const [reportError, setReportError] = useState("");

  async function captureReportLocation() {
    setReportLocationStatus("capturing");
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") {
      setReportLocationStatus("error");
      return;
    }
    try {
      const pos = await Location.getCurrentPositionAsync({});
      setReportLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      setReportLocationStatus("captured");
    } catch {
      setReportLocationStatus("error");
    }
  }

  async function submitReport() {
    if (!reportLocation || !reportDescription.trim()) return;
    setSubmittingReport(true);
    setReportError("");
    try {
      await apiFetch("/api/community-reports", {
        method: "POST",
        body: JSON.stringify({ type: reportType, description: reportDescription.trim(), location: reportLocation }),
      });
      setReportSent(true);
      setReportDescription("");
      setReportLocation(null);
      setReportLocationStatus("idle");
    } catch (err: any) {
      setReportError(err.message || t("volunteerCommunityReport.reportFailed"));
    } finally {
      setSubmittingReport(false);
    }
  }

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16 }}>
      <Text className="text-2xl font-semibold text-gray-900">{t("volunteerCommunityReport.title")}</Text>
      <Text className="mt-1 text-sm text-gray-600">{t("volunteerCommunityReport.subtitle")}</Text>

      <View className="mt-6 rounded-xl border border-gray-200 bg-white p-5">
        {reportSent ? (
          <View className="rounded border border-green-200 bg-green-50 p-3">
            <Text className="text-sm text-green-800">{t("volunteerCommunityReport.reportSubmitted")}</Text>
            <TouchableOpacity onPress={() => setReportSent(false)} className="mt-1" accessibilityRole="button">
              <Text className="text-sm text-green-800 underline">{t("volunteerCommunityReport.reportAnother")}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <View className="rounded border border-gray-300">
              <Picker selectedValue={reportType} onValueChange={(v) => setReportType(v as typeof reportType)}>
                {Object.entries(reportTypeLabel(t)).map(([key, label]) => (
                  <Picker.Item key={key} label={label} value={key} />
                ))}
              </Picker>
            </View>
            <TextInput
              value={reportDescription}
              onChangeText={setReportDescription}
              multiline
              numberOfLines={2}
              placeholder={t("volunteerCommunityReport.reportDescPlaceholder")}
              accessibilityLabel={t("volunteerCommunityReport.reportDescPlaceholder")}
              className="rounded border border-gray-300 px-3 py-2 text-sm"
              style={{ textAlignVertical: "top" }}
            />
            <View>
              {reportLocationStatus === "idle" && (
                <TouchableOpacity onPress={captureReportLocation} accessibilityRole="button">
                  <Text className="text-sm text-slate-700 underline">{t("volunteerCommunityReport.captureMyLocation")}</Text>
                </TouchableOpacity>
              )}
              {reportLocationStatus === "capturing" && (
                <Text className="text-sm text-gray-500">{t("volunteerCommunityReport.capturingLocation")}</Text>
              )}
              {reportLocationStatus === "captured" && (
                <Text className="text-sm text-green-700">{t("volunteerCommunityReport.locationCaptured")}</Text>
              )}
              {reportLocationStatus === "error" && (
                <View className="flex-row items-center" style={{ gap: 8 }}>
                  <Text className="text-sm text-red-600">{t("volunteerCommunityReport.locationErrorGeneric")}</Text>
                  <TouchableOpacity onPress={captureReportLocation} accessibilityRole="button">
                    <Text className="text-sm text-slate-700 underline">{t("volunteerCommunityReport.tryAgain")}</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
            {reportError ? <Text className="text-xs text-red-600">{reportError}</Text> : null}
            <TouchableOpacity
              onPress={submitReport}
              disabled={!reportLocation || !reportDescription.trim() || submittingReport}
              accessibilityRole="button"
              accessibilityState={{ disabled: !reportLocation || !reportDescription.trim() || submittingReport }}
              className="items-center rounded bg-orange-600 py-2.5"
              style={{ opacity: !reportLocation || !reportDescription.trim() || submittingReport ? 0.5 : 1 }}
            >
              <Text className="text-sm font-medium text-white">
                {submittingReport ? t("volunteerCommunityReport.submitting") : t("volunteerCommunityReport.submitReport")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
