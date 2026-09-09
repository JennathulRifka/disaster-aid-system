import { useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

const REPORT_TYPES = ["road_closure", "water_level", "other"] as const;

export default function VolunteerCommunityReport() {
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

  function captureReportLocation() {
    setReportLocationStatus("capturing");
    if (!navigator.geolocation) {
      setReportLocationStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setReportLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setReportLocationStatus("captured");
      },
      () => setReportLocationStatus("error")
    );
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
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("volunteerCommunityReport.title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("volunteerCommunityReport.subtitle")}</p>

      <div className="mt-6 max-w-xl rounded-xl border border-gray-200 bg-white p-6">
        {reportSent ? (
          <div className="rounded border border-green-200 bg-green-50 p-3 text-sm text-green-800">
            {t("volunteerCommunityReport.reportSubmitted")}
            <button onClick={() => setReportSent(false)} className="ml-2 underline">
              {t("volunteerCommunityReport.reportAnother")}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as typeof reportType)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              {REPORT_TYPES.map((key) => (
                <option key={key} value={key}>
                  {t(`volunteerCommunityReport.reportType.${key}`)}
                </option>
              ))}
            </select>
            <textarea
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              rows={2}
              placeholder={t("volunteerCommunityReport.reportDescPlaceholder")}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="text-sm">
              {reportLocationStatus === "idle" && (
                <button onClick={captureReportLocation} className="text-slate-700 underline">
                  {t("volunteerCommunityReport.captureMyLocation")}
                </button>
              )}
              {reportLocationStatus === "capturing" && (
                <p className="text-gray-500">{t("volunteerCommunityReport.capturingLocation")}</p>
              )}
              {reportLocationStatus === "captured" && (
                <p className="text-green-700">{t("volunteerCommunityReport.locationCaptured")}</p>
              )}
              {reportLocationStatus === "error" && (
                <div className="flex items-center gap-2">
                  <p className="text-red-600">{t("volunteerCommunityReport.locationErrorGeneric")}</p>
                  <button onClick={captureReportLocation} className="text-slate-700 underline">
                    {t("volunteerCommunityReport.tryAgain")}
                  </button>
                </div>
              )}
            </div>
            {reportError && <p className="text-xs text-red-600">{reportError}</p>}
            <button
              onClick={submitReport}
              disabled={!reportLocation || !reportDescription.trim() || submittingReport}
              className="w-full rounded bg-orange-600 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {submittingReport ? t("volunteerCommunityReport.submitting") : t("volunteerCommunityReport.submitReport")}
            </button>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
