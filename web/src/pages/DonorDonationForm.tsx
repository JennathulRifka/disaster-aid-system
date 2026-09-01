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
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("");
  const [deliveryMethod, setDeliveryMethod] = useState<"self" | "volunteer">("volunteer");
  const [notes, setNotes] = useState("");
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "captured" | "error">("idle");
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMode, setLocationMode] = useState<"gps" | "map">("gps");
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
    if (!quantity) {
      setError(t("donorDonationForm.errorNoQuantity"));
      return;
    }
    setSubmitting(true);
    try {
      await apiFetch("/api/donations", {
        method: "POST",
        body: JSON.stringify({ category, quantity, location, deliveryMethod, notes }),
      });
      navigate("/donations/mine");
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
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("donorDonationForm.category")}</label>
            {categoriesLoading ? (
              <p className="text-sm text-gray-500">{t("common.loading")}</p>
            ) : (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                {Object.entries(categories).map(([key, c]) => (
                  <option key={key} value={key}>
                    {t(`categories.${key}`, c.label)}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">{t("donorDonationForm.quantity")}</label>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder={t("donorDonationForm.quantityPlaceholder")}
            />
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
            <p className="mb-2 text-xs text-gray-500">{t("donorDonationForm.pickupLocationHint")}</p>

            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={() => setLocationMode("gps")}
                className={`rounded border px-3 py-1.5 text-xs font-medium ${
                  locationMode === "gps"
                    ? "border-orange-600 bg-orange-600 text-white"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {t("donorDonationForm.captureLocation")}
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
              <>
                <button
                  type="button"
                  onClick={captureLocation}
                  className="rounded border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {locationStatus === "captured"
                    ? t("donorDonationForm.locationCaptured")
                    : t("donorDonationForm.captureLocation")}
                </button>
                {locationStatus === "error" && (
                  <p className="mt-1 text-xs text-red-600">{t("donorDonationForm.locationError")}</p>
                )}
              </>
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
