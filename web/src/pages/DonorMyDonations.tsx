import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryQrCode } from "@/components/DeliveryQrCode";
import { ChatModal } from "@/components/ChatModal";
import { apiFetch } from "@/lib/api";

// Chats open once the delivery is actually linked — immediately for
// self-delivery (accepted at match time), or once a volunteer accepts for
// volunteer-delivery — and stay usable through the rest of the delivery.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface Donation {
  id: string;
  category: string;
  quantity: string;
  status: string;
  deliveryMethod: "self" | "volunteer";
  assignedDeliveryId: string | null;
  deliveryStatus: string | null;
  createdAt: string;
}

interface Delivery {
  id: string;
  confirmToken?: string;
}

export default function DonorMyDonations() {
  const { t } = useTranslation();
  const [donations, setDonations] = useState<Donation[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery>>({});
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data: Donation[] = await apiFetch("/api/donations/mine");
    setDonations(data);

    // For self-delivery donations already marked delivered, fetch the
    // delivery so we can show the confirmation QR code.
    const readyForQr = data.filter((d) => d.deliveryMethod === "self" && d.deliveryStatus === "delivered");
    const results = await Promise.all(
      readyForQr.map((d) => apiFetch(`/api/deliveries/by-donation/${d.id}`).then((dv) => [d.id, dv] as const))
    );
    const deliveryMap: Record<string, Delivery> = {};
    results.forEach(([donationId, delivery]) => {
      if (delivery) deliveryMap[donationId] = delivery;
    });
    setDeliveries(deliveryMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDelivered(donation: Donation) {
    if (!donation.assignedDeliveryId) return;
    setActingOn(donation.id);
    try {
      await apiFetch(`/api/deliveries/${donation.assignedDeliveryId}/self-deliver`, { method: "PATCH" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("donorMyDonations.title")}</h1>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : donations.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("donorMyDonations.noDonations")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {donations.map((d) => {
            const delivery = deliveries[d.id];
            return (
              <div key={d.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium capitalize text-gray-900">
                      {t(`categories.${d.category}`, d.category)} — {d.quantity}
                    </p>
                    <p className="text-xs text-gray-500">
                      {d.deliveryMethod === "self"
                        ? t("donorMyDonations.selfDelivery")
                        : t("donorMyDonations.volunteer")}{" "}
                      · {t("donorMyDonations.registered")} {new Date(d.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={d.status} />
                    {d.assignedDeliveryId && d.deliveryStatus && CHATTABLE_STATUSES.has(d.deliveryStatus) && (
                      <button
                        onClick={() =>
                          setActiveChatId(
                            `${d.assignedDeliveryId}_${d.deliveryMethod === "self" ? "donor_victim" : "donor_volunteer"}`
                          )
                        }
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        💬{" "}
                        {d.deliveryMethod === "self"
                          ? t("donorMyDonations.chatWithVictim")
                          : t("donorMyDonations.chatWithVolunteer")}
                      </button>
                    )}
                    {d.deliveryMethod === "self" && d.deliveryStatus === "accepted" && (
                      <button
                        disabled={actingOn === d.id}
                        onClick={() => markDelivered(d)}
                        className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                      >
                        {actingOn === d.id ? t("donorMyDonations.updating") : t("donorMyDonations.markDelivered")}
                      </button>
                    )}
                    {d.deliveryStatus && d.deliveryStatus !== "accepted" && (
                      <StatusBadge status={d.deliveryStatus} />
                    )}
                  </div>
                </div>

                {d.deliveryMethod === "self" && d.deliveryStatus === "delivered" && delivery?.confirmToken && (
                  <div className="mt-4 flex justify-center">
                    <DeliveryQrCode deliveryId={delivery.id} token={delivery.confirmToken} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {activeChatId && <ChatModal chatId={activeChatId} onClose={() => setActiveChatId(null)} />}
    </DashboardLayout>
  );
}
