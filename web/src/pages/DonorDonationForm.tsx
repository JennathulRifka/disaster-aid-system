import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import "@/lib/leafletIcons";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface CategoryLimit {
  label: string;
  max: number | null;
  unit: string;
}

const SRI_LANKA_CENTER: [number, number] = [7.8731, 80.7718];

// react-leaflet has no onClick prop on MapContainer — click handling only
// works via useMapEvents inside a child component.
function LocationPicker({ onPick }: { onPick: (loc: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

export default function DonorDonationForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<Record<string, CategoryLimit>>({});
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [items, setItems] = useState<Record<string, string>>({});
  // The free-text `items` quantity above stays the display label ("50 kg
  // rice") — unchanged. `itemAmounts` is the new real-number field the
  // district-inventory feature needs for actual remainder arithmetic (see
  // "Donation leftover-quantity tracking" in CLAUDE.md for why free text
  // alone can't support that).
  const [itemAmounts, setItemAmounts] = useState<Record<string, string>>({});
  const [deliveryMethod, setDeliveryMethod] = useState<"self" | "volunteer">("volunteer");
  const [notes, setNotes] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMode, setLocationMode] = useState<"gps" | "map">("gps");
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

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
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
      // One donation per selected category — donations have always been
      // single-category documents throughout this app (matching, delivery
      // tracking, and chat all key off one category per donation), so a
      // multi-item drop-off registers as several donations sharing the same
      // location/delivery method/notes, rather than a new multi-item schema.
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
      navigate("/donations/mine", anyFailed ? { state: { partialFailure: true } } : undefined);
    } catch (err: any) {
      setError(err.message || t("donorDonationForm.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-semibold text-gray-900">{t("donorDonationForm.title")}</h1>
        <p className="mt-1 text-sm text-gray-600">{t("donorDonationForm.subtitle")}</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-5 rounded-xl bg-white p-6 shadow-sm">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("donorDonationForm.whatAreYouDonating")}
            </label>
            <p className="mb-2 text-xs text-gray-500">{t("donorDonationForm.whatAreYouDonatingHint")}</p>
            {categoriesLoading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : (
              <div className="space-y-2">
                {categoryKeys.map((category) => {
                  const c = categories[category];
                  const selected = category in items;
                  return (
                    <div
                      key={category}
                      className={`flex items-center justify-between gap-3 rounded border px-3 py-2 ${
                        selected ? "border-orange-600 bg-orange-50" : "border-gray-300"
                      }`}
                    >
                      <label className="flex items-center gap-2 text-sm text-gray-700">
                        <input type="checkbox" checked={selected} onChange={() => toggleCategory(category)} />
                        {t(`categories.${category}`, c.label)}
                      </label>
                      {selected && (
                        <div className="flex gap-2">
                          <input
                            value={items[category]}
                            onChange={(e) => setItemQuantity(category, e.target.value)}
                            placeholder={t("donorDonationForm.quantityPlaceholder")}
                            className="w-32 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                          <input
                            type="number"
                            min="1"
                            value={itemAmounts[category] ?? ""}
                            onChange={(e) => setItemAmount(category, e.target.value)}
                            placeholder={t("donorDonationForm.amountPlaceholder")}
                            aria-label={t("donorDonationForm.amountPlaceholder")}
                            className="w-20 rounded border border-gray-300 px-2 py-1 text-sm"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              {t("donorDonationForm.deliveryMethodLabel")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setDeliveryMethod("volunteer")}
                className={`rounded border px-3 py-2 text-left text-sm ${
                  deliveryMethod === "volunteer"
                    ? "border-orange-600 bg-orange-50 text-orange-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="block font-medium">{t("donorDonationForm.findVolunteer")}</span>
                <span className="text-xs text-gray-500">{t("donorDonationForm.findVolunteerDesc")}</span>
              </button>
              <button
                type="button"
                onClick={() => setDeliveryMethod("self")}
                className={`rounded border px-3 py-2 text-left text-sm ${
                  deliveryMethod === "self"
                    ? "border-orange-600 bg-orange-50 text-orange-700"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span className="block font-medium">{t("donorDonationForm.selfDeliver")}</span>
                <span className="text-xs text-gray-500">{t("donorDonationForm.selfDeliverDesc")}</span>
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              {t("donorDonationForm.pickupLocation")}
            </label>

            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setLocationMode("gps");
                  captureLocation();
                }}
                className={`rounded border px-3 py-1.5 text-xs font-medium ${
                  locationMode === "gps"
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {locationMode === "gps" && locationStatus === "capturing"
                  ? t("donorDonationForm.capturingLocation")
                  : locationMode === "gps" && locationStatus === "captured"
                    ? t("donorDonationForm.locationCaptured")
                    : t("donorDonationForm.captureLocation")}
              </button>
              <button
                type="button"
                onClick={() => setLocationMode("map")}
                className={`rounded border px-3 py-1.5 text-xs font-medium ${
                  locationMode === "map"
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t("donorDonationForm.chooseOnMap")}
              </button>
            </div>

            {locationMode === "gps" ? (
              locationStatus === "error" && (
                <p className="mt-1 text-xs text-red-600">{t("donorDonationForm.locationError")}</p>
              )
            ) : (
              <>
                <div className="overflow-hidden rounded border border-gray-300" style={{ height: "260px" }}>
                  <MapContainer
                    center={location ? [location.lat, location.lng] : SRI_LANKA_CENTER}
                    zoom={location ? 13 : 7}
                    style={{ height: "100%", width: "100%" }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <LocationPicker
                      onPick={(loc) => {
                        setLocation(loc);
                        setLocationStatus("captured");
                      }}
                    />
                    {location && <Marker position={[location.lat, location.lng]} />}
                  </MapContainer>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {location ? t("donorDonationForm.pinPlaced") : t("donorDonationForm.clickToPin")}
                </p>
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("donorDonationForm.notes")}</label>
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
            disabled={submitting || categoriesLoading}
            className="w-full rounded bg-orange-600 py-2.5 font-medium text-white hover:bg-orange-700 disabled:opacity-50"
          >
            {submitting ? t("donorDonationForm.registering") : t("donorDonationForm.registerButton")}
          </button>
        </form>
      </div>
    </DashboardLayout>
  );
}
