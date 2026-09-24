import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryQrCode } from "@/components/DeliveryQrCode";
import { ChatModal } from "@/components/ChatModal";
import { apiFetch } from "@/lib/api";
import { deliveryChatId } from "@/lib/deliveryChat";

// Chats open once the delivery is actually linked — immediately for
// self-delivery (accepted at match time), or once a volunteer accepts for
// volunteer-delivery — and stay usable through the rest of the delivery.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface Donation {
  id: string;
  category: string;
  quantity: string;
  quantityValue?: number;
  remainingQuantity?: number;
  status: string;
  deliveryMethod: "self" | "volunteer";
  createdAt: string;
}

interface Delivery {
  id: string;
  donationId: string;
  status: string;
  method: "self" | "volunteer";
  allocatedQuantity?: number;
  confirmToken?: string;
  handoffVersion?: number;
}

export default function DonorMyDonations() {
  const { t } = useTranslation();
  const location = useLocation();
  const partialFailure = Boolean((location.state as { partialFailure?: boolean } | null)?.partialFailure);
  const [donations, setDonations] = useState<Donation[]>([]);
  // A donation can now have more than one delivery over its lifetime — once
  // it has leftover remainingQuantity, admin can match it again for a
  // different request (see "Donation leftover-quantity tracking" in
  // CLAUDE.md). GET /by-donation/:id returns every delivery, not just one.
  const [deliveriesByDonation, setDeliveriesByDonation] = useState<Record<string, Delivery[]>>({});
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data: Donation[] = await apiFetch("/api/donations/mine");
    setDonations(data);

    const results = await Promise.all(
      data.map((d) => apiFetch(`/api/deliveries/by-donation/${d.id}`).then((list: Delivery[]) => [d.id, list] as const))
    );
    const map: Record<string, Delivery[]> = {};
    results.forEach(([donationId, list]) => {
      map[donationId] = list;
    });
    setDeliveriesByDonation(map);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function markDelivered(deliveryId: string) {
    setActingOn(deliveryId);
    try {
      await apiFetch(`/api/deliveries/${deliveryId}/self-deliver`, { method: "PATCH" });
      await load();
    } finally {
      setActingOn(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("donorMyDonations.title")}</h1>

      {partialFailure && (
        <p className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("donorDonationForm.errorPartial")}
        </p>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : donations.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("donorMyDonations.noDonations")}</p>
      ) : (
        <div className="mt-6 space-y-3">
          {donations.map((d) => {
            const deliveries = deliveriesByDonation[d.id] || [];
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
                  <StatusBadge status={d.status} />
                </div>

                {typeof d.remainingQuantity === "number" && d.remainingQuantity > 0 && (
                  <p className="mt-2 text-xs text-green-700">
                    {t("donorMyDonations.remainingAvailable", { count: d.remainingQuantity })}
                  </p>
                )}

                {deliveries.length === 0 ? (
                  <p className="mt-2 text-xs text-gray-400">{t("donorMyDonations.notMatchedYet")}</p>
                ) : (
                  <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                    {deliveries.map((delivery) => (
                      <div key={delivery.id} className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                          <StatusBadge status={delivery.status} />
                          {typeof delivery.allocatedQuantity === "number" && (
                            <span className="text-xs text-gray-500">
                              {t("donorMyDonations.allocatedAmount", { count: delivery.allocatedQuantity })}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {CHATTABLE_STATUSES.has(delivery.status) && (
                            <button
                              onClick={() =>
                                setActiveChatId(
                                  deliveryChatId(
                                    delivery.id,
                                    delivery.method === "self" ? "donor_victim" : "donor_volunteer",
                                    delivery.handoffVersion
                                  )
                                )
                              }
                              className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              💬{" "}
                              {delivery.method === "self"
                                ? t("donorMyDonations.chatWithVictim")
                                : t("donorMyDonations.chatWithVolunteer")}
                            </button>
                          )}
                          {delivery.method === "self" && delivery.status === "accepted" && (
                            <button
                              disabled={actingOn === delivery.id}
                              onClick={() => markDelivered(delivery.id)}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {actingOn === delivery.id ? t("donorMyDonations.updating") : t("donorMyDonations.markDelivered")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                    {deliveries
                      .filter((delivery) => delivery.method === "self" && delivery.status === "delivered" && delivery.confirmToken)
                      .map((delivery) => (
                        <div key={`${delivery.id}-qr`} className="flex justify-center pt-2">
                          <DeliveryQrCode
                            deliveryId={delivery.id}
                            token={delivery.confirmToken as string}
                            details={t(`categories.${d.category}`, d.category)}
                          />
                        </div>
                      ))}
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
