import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch } from "@/lib/api";

type SosType = "trapped" | "missing_person" | "flood_rescue" | "other";
type LocationStatus = "capturing" | "captured" | "error";

const SOS_TYPE_KEYS: SosType[] = ["trapped", "missing_person", "flood_rescue", "other"];

/**
 * Deliberately separate from the aid-request flow — a life-safety emergency
 * needs the fewest possible taps, not a multi-category form. Rendered once
 * in DashboardLayout so it's reachable from every page, for every role (not
 * just "victim" — someone could be reporting on behalf of another person).
 */
export function SosButton() {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<SosType | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("capturing");
  const [peopleCount, setPeopleCount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  function captureLocation() {
    setLocationStatus("capturing");
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationStatus("captured");
      },
      () => setLocationStatus("error")
    );
  }

  // Start capturing the instant the modal opens — no separate "capture
  // location" tap required, matching "every second of friction matters."
  useEffect(() => {
    if (open) captureLocation();
  }, [open]);

  function handleClose() {
    setOpen(false);
    setType(null);
    setLocation(null);
    setLocationStatus("capturing");
    setPeopleCount("");
    setDescription("");
    setError("");
    setSent(false);
  }

  async function handleSubmit() {
    if (!type || !location) return;
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/api/sos", {
        method: "POST",
        body: JSON.stringify({
          type,
          location,
          peopleCount: peopleCount ? Number(peopleCount) : null,
          description: description.trim(),
        }),
      });
      setSent(true);
    } catch (err: any) {
      setError(err.message || t("sos.submitFailed"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-lg hover:bg-red-700"
      >
        🆘 {t("sos.buttonLabel")}
      </button>

      {open && (
        // z-[1200]: Leaflet's own map panes/controls use raw z-index up to
        // 1000 (not Tailwind's scale), which otherwise renders on top of this
        // modal on any page with a map (/admin/map, /admin/sos).
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5">
            {sent ? (
              <div className="text-center">
                <p className="text-3xl">✅</p>
                <h3 className="mt-2 text-base font-semibold text-gray-900">{t("sos.sentTitle")}</h3>
                <p className="mt-1 text-sm text-gray-600">{t("sos.sentBody")}</p>
                <button
                  onClick={handleClose}
                  className="mt-4 w-full rounded bg-gray-100 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
                >
                  {t("common.close")}
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-base font-bold text-red-700">🆘 {t("sos.modalTitle")}</h3>
                  <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700">
                    {t("common.close")}
                  </button>
                </div>

                <p className="mb-3 text-xs text-gray-500">{t("sos.modalSubtitle")}</p>

                <div className="grid grid-cols-2 gap-2">
                  {SOS_TYPE_KEYS.map((key) => (
                    <button
                      key={key}
                      onClick={() => setType(key)}
                      className={`rounded border px-3 py-3 text-sm font-medium ${
                        type === key
                          ? "border-red-600 bg-red-50 text-red-700"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {t(`sos.type.${key}`)}
                    </button>
                  ))}
                </div>

                <div className="mt-3 text-sm">
                  {locationStatus === "capturing" && (
                    <p className="text-gray-500">{t("sos.locationCapturing")}</p>
                  )}
                  {locationStatus === "captured" && (
                    <p className="text-green-700">{t("sos.locationCaptured")}</p>
                  )}
                  {locationStatus === "error" && (
                    <div className="flex items-center gap-2">
                      <p className="text-red-600">{t("sos.locationError")}</p>
                      <button onClick={captureLocation} className="text-slate-700 underline">
                        {t("common.retry")}
                      </button>
                    </div>
                  )}
                </div>

                <input
                  type="number"
                  min={1}
                  value={peopleCount}
                  onChange={(e) => setPeopleCount(e.target.value)}
                  placeholder={t("sos.peopleCountPlaceholder")}
                  className="mt-3 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder={t("sos.descriptionPlaceholder")}
                  className="mt-2 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />

                {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

                <button
                  onClick={handleSubmit}
                  disabled={!type || !location || submitting}
                  className="mt-3 w-full rounded bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {submitting ? t("sos.sending") : t("sos.sendButton")}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
