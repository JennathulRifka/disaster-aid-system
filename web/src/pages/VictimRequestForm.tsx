import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";
import { nearestDistrict } from "@/lib/districts";

const DISASTER_TYPES = ["flood", "landslide", "cyclone", "drought", "other"];
const SEVERITIES = ["low", "medium", "high", "critical"];
const VULNERABLE_OPTIONS = ["children", "elderly", "pregnant women", "people with disabilities"];

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

export default function VictimRequestForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [categoryLimits, setCategoryLimits] = useState<Record<string, CategoryLimit>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [disasterType, setDisasterType] = useState("flood");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [severity, setSeverity] = useState("medium");
  const [peopleAffected, setPeopleAffected] = useState(1);
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
    // Public endpoint — informational only, never gates submission (see the
    // soft note near the location button). A victim outside an actively
    // declared district still gets reviewed exactly the same way.
    apiFetch("/api/active-districts").then((data: { district: string }[]) => {
      setActiveDistrictNames(new Set(data.map((d) => d.district)));
    });
  }, []);

  const categoryKeys = Object.keys(categoryLimits);
  const detectedDistrict = location ? nearestDistrict(location) : null;
  const districtIsActive = detectedDistrict ? activeDistrictNames.has(detectedDistrict) : false;

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

  function toggleVulnerable(group: string) {
    setVulnerableGroups((prev) =>
      prev.includes(group) ? prev.filter((g) => g !== group) : [...prev, group]
    );
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
          peopleAffected,
          vulnerableGroups,
          location,
          notes,
        }),
      });
      navigate("/request/mine");
    } catch (err: any) {
      setError(err.message || t("victimRequestForm.submitFailed", "Failed to submit request."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-gray-900">{t("victimRequestForm.title")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("victimRequestForm.subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("victimRequestForm.disasterType")}
              </label>
              <select
                value={disasterType}
                onChange={(e) => setDisasterType(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {DISASTER_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`disasterTypes.${type}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                {t("victimRequestForm.severity")}
              </label>
              <select
                value={severity}
                onChange={(e) => setSeverity(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {t(`severities.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("victimRequestForm.whatDoYouNeed")}
            </label>
            {categoriesLoading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : (
              <div className="space-y-2">
                {categoryKeys.map((category) => {
                  const limit = categoryLimits[category];
                  const selected = category in quantities;
                  return (
                    <div
                      key={category}
                      className={`flex items-center justify-between rounded border px-3 py-2 ${
                        selected ? "border-orange-600 bg-orange-50" : "border-gray-300"
                      }`}
                    >
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleCategory(category)}
                        />
                        {t(`categories.${category}`, limit.label)}
                        <span className="text-xs text-gray-400">
                          {limit.max === null
                            ? `(${limit.unit}, ${t("victimRequestForm.noFixedCap")})`
                            : `(${t("victimRequestForm.upTo")} ${limit.max} ${limit.unit})`}
                        </span>
                      </label>
                      {selected && (
                        <input
                          type="number"
                          min={1}
                          max={limit.max ?? undefined}
                          value={quantities[category]}
                          onChange={(e) => setQuantity(category, Number(e.target.value))}
                          className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("victimRequestForm.peopleAffected")}
            </label>
            <input
              type="number"
              min={1}
              value={peopleAffected}
              onChange={(e) => setPeopleAffected(Number(e.target.value))}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("victimRequestForm.vulnerableGroups")}
            </label>
            <div className="flex flex-wrap gap-2">
              {VULNERABLE_OPTIONS.map((group) => (
                <button
                  type="button"
                  key={group}
                  onClick={() => toggleVulnerable(group)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium ${
                    vulnerableGroups.includes(group)
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-gray-300 text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {t(`vulnerableGroups.${group}`)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("victimRequestForm.location")}
            </label>
            <button
              type="button"
              onClick={captureLocation}
              className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              {locationStatus === "captured"
                ? t("victimRequestForm.locationCaptured")
                : t("victimRequestForm.captureLocation")}
            </button>
            {locationStatus === "error" && (
              <p className="mt-1 text-xs text-red-600">{t("victimRequestForm.locationError")}</p>
            )}
            {locationStatus === "captured" && detectedDistrict && !districtIsActive && (
              <p className="mt-2 text-xs text-amber-700">
                {t(
                  "victimRequestForm.noActiveEmergencyNote",
                  "No declared emergency currently active in your area — your request will still be reviewed."
                )}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("victimRequestForm.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded bg-orange-600 py-2.5 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {submitting ? t("victimRequestForm.submitting") : t("victimRequestForm.submitButton")}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
