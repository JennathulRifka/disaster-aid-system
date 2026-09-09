import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryQrCode } from "@/components/DeliveryQrCode";
import { ChatModal } from "@/components/ChatModal";
import { apiFetch } from "@/lib/api";

const NAVIGABLE_STATUSES = new Set(["accepted", "picked_up"]);
// Chats open once a volunteer accepts (see server/src/utils/deliveryChats.js)
// and stay usable through the rest of the delivery — not before acceptance
// (nothing to chat about yet) and not for a rejected assignment.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface Delivery {
  id: string;
  requestId: string;
  donationId: string;
  status: string;
  createdAt: string;
  confirmToken?: string;
}

const NEXT_STATUS: Record<string, string> = {
  accepted: "picked_up",
  picked_up: "delivered",
};

export default function VolunteerDeliveries() {
  const { t } = useTranslation();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");

  async function load() {
    setLoading(true);
    const data = await apiFetch("/api/deliveries/mine");
    setDeliveries(data);
    setLoading(false);
  }

  useEffect(() => {
    load();
    apiFetch("/api/users/me").then((me) => {
      setAvailable(me.available !== false);
      setMyLocation(me.location || null);
    });
  }, []);

  async function toggleAvailability() {
    if (available === null) return;
    const next = !available;
    setSavingAvailability(true);
    try {
      await apiFetch("/api/users/availability", {
        method: "PATCH",
        body: JSON.stringify({ available: next }),
      });
      setAvailable(next);
    } finally {
      setSavingAvailability(false);
    }
  }

  function updateMyLocation() {
    setLocationStatus("capturing");
    if (!navigator.geolocation) {
      setLocationStatus("error");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        try {
          await apiFetch("/api/users/location", { method: "PATCH", body: JSON.stringify({ location }) });
          setMyLocation(location);
          setLocationStatus("idle");
        } catch {
          setLocationStatus("error");
        }
      },
      () => setLocationStatus("error")
    );
  }

  async function respond(delivery: Delivery, decision: "accept" | "reject") {
    let reason: string | null = null;
    if (decision === "reject") {
      reason = window.prompt(t("volunteerDeliveries.rejectPrompt"));
      if (reason === null) return; // cancelled the prompt
    }

    setActingOn(delivery.id);
    try {
      await apiFetch(`/api/deliveries/${delivery.id}/${decision}`, {
        method: "PATCH",
        body: decision === "reject" ? JSON.stringify({ reason }) : undefined,
      });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  async function advanceStatus(delivery: Delivery) {
    const nextStatus = NEXT_STATUS[delivery.status];
    if (!nextStatus) return;
    setActingOn(delivery.id);

    let currentLocation: { lat: number; lng: number } | undefined;
    if (navigator.geolocation) {
      try {
        const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
          navigator.geolocation.getCurrentPosition(resolve, reject)
        );
        currentLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      } catch {
        // Location optional — proceed without it if denied.
      }
    }

    try {
      await apiFetch(`/api/deliveries/${delivery.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: nextStatus, currentLocation }),
      });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-gray-900">{t("volunteerDeliveries.title")}</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={updateMyLocation}
            disabled={locationStatus === "capturing"}
            title={t("volunteerDeliveries.setLocationTooltip")}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
              myLocation
                ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${myLocation ? "bg-green-500" : "bg-amber-500"}`} />
            {locationStatus === "capturing"
              ? t("volunteerDeliveries.locating")
              : myLocation
                ? t("volunteerDeliveries.locationSetUpdate")
                : t("volunteerDeliveries.setMyLocation")}
          </button>
          {available !== null && (
            <button
              onClick={toggleAvailability}
              disabled={savingAvailability}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${
                available
                  ? "border-green-200 bg-green-50 text-green-700 hover:bg-green-100"
                  : "border-gray-300 bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${available ? "bg-green-500" : "bg-gray-400"}`} />
              {available ? t("volunteerDeliveries.availableForDeliveries") : t("volunteerDeliveries.unavailable")}
            </button>
          )}
        </div>
      </div>
      {locationStatus === "error" && (
        <p className="mt-1 text-right text-xs text-red-600">{t("volunteerDeliveries.locationErrorPermissions")}</p>
      )}
      {!myLocation && (
        <p className="mt-1 text-right text-xs text-amber-700">{t("volunteerDeliveries.setLocationHint")}</p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : deliveries.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("volunteerDeliveries.noDeliveries")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {deliveries.map((d) => (
            <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {t("volunteerDeliveries.deliveryNumber", { id: d.id.slice(0, 6) })}
                  </p>
                  <p className="text-xs text-gray-500">
                    {t("volunteerDeliveries.requestDonationLine", {
                      requestId: d.requestId.slice(0, 6),
                      donationId: d.donationId.slice(0, 6),
                    })}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={d.status} />
                  {CHATTABLE_STATUSES.has(d.status) && (
                    <>
                      <button
                        onClick={() => setActiveChatId(`${d.id}_donor_volunteer`)}
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        💬 {t("volunteerDeliveries.chatDonor")}
                      </button>
                      <button
                        onClick={() => setActiveChatId(`${d.id}_volunteer_victim`)}
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        💬 {t("volunteerDeliveries.chatVictim")}
                      </button>
                    </>
                  )}
                  {NAVIGABLE_STATUSES.has(d.status) && (
                    <Link
                      to={`/deliveries/${d.id}/navigate`}
                      className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                    >
                      {t("volunteerDeliveries.navigate")}
                    </Link>
                  )}
                  {d.status === "pending_acceptance" && (
                    <>
                      <button
                        disabled={actingOn === d.id}
                        onClick={() => respond(d, "accept")}
                        className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {t("volunteerDeliveries.accept")}
                      </button>
                      <button
                        disabled={actingOn === d.id}
                        onClick={() => respond(d, "reject")}
                        className="rounded bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        {t("volunteerDeliveries.reject")}
                      </button>
                    </>
                  )}
                  {NEXT_STATUS[d.status] && (
                    <button
                      disabled={actingOn === d.id}
                      onClick={() => advanceStatus(d)}
                      className="rounded bg-orange-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-700 disabled:opacity-50"
                    >
                      {actingOn === d.id
                        ? t("volunteerDeliveries.updating")
                        : t(`volunteerDeliveries.action.${d.status}`)}
                    </button>
                  )}
                </div>
              </div>

              {d.status === "delivered" && d.confirmToken && (
                <div className="mt-4 flex justify-center">
                  <DeliveryQrCode deliveryId={d.id} token={d.confirmToken} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeChatId && <ChatModal chatId={activeChatId} onClose={() => setActiveChatId(null)} />}
    </DashboardLayout>
  );
}
