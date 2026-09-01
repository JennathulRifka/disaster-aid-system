import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { QrScanModal } from "@/components/QrScanModal";
import { ChatModal } from "@/components/ChatModal";
import { apiFetch } from "@/lib/api";

// Chats open once the delivery is actually linked (immediately for
// self-delivery, once a volunteer accepts for volunteer-delivery) and stay
// viewable (read-only once locked) through the rest of the delivery.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface RequestItem {
  category: string;
  quantity: number;
  status: string;
  donationId: string | null;
}

interface AidRequest {
  id: string;
  disasterType: string;
  items: RequestItem[];
  severity: string;
  status: string;
  priorityScore: number;
  createdAt: string;
}

interface Delivery {
  id: string;
  category: string;
  donationId: string;
  status: string;
  method: "self" | "volunteer";
}

export default function VictimMyRequests() {
  const { t } = useTranslation();
  const [requests, setRequests] = useState<AidRequest[]>([]);
  const [deliveries, setDeliveries] = useState<Record<string, Delivery[]>>({});
  const [loading, setLoading] = useState(true);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [scanning, setScanning] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const data: AidRequest[] = await apiFetch("/api/requests/mine");
    setRequests(data);

    // For any request with at least one matched item, fetch its deliveries
    // (one per matched category) so we can show progress / confirm buttons.
    const trackable = data.filter((r) => (r.items || []).some((item) => item.status !== "pending"));
    const results = await Promise.all(
      trackable.map((r) =>
        apiFetch(`/api/deliveries/by-request/${r.id}`).then((d) => [r.id, d as Delivery[]] as const)
      )
    );
    const deliveryMap: Record<string, Delivery[]> = {};
    results.forEach(([requestId, list]) => {
      deliveryMap[requestId] = list;
    });
    setDeliveries(deliveryMap);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleScan(decodedText: string) {
    setScanning(false);
    let payload: { deliveryId?: string; token?: string };
    try {
      payload = JSON.parse(decodedText);
    } catch {
      setMessage(t("victimMyRequests.invalidQr", "That QR code isn't a valid confirmation code."));
      return;
    }
    if (!payload.deliveryId || !payload.token) {
      setMessage(t("victimMyRequests.invalidQr", "That QR code isn't a valid confirmation code."));
      return;
    }

    setConfirmingId(payload.deliveryId);
    setMessage("");
    try {
      await apiFetch(`/api/deliveries/${payload.deliveryId}/confirm`, {
        method: "POST",
        body: JSON.stringify({ token: payload.token }),
      });
      setMessage(t("victimMyRequests.deliveryConfirmedThanks"));
      await load();
    } catch (err: any) {
      setMessage(err.message || t("victimMyRequests.confirmFailed", "Failed to confirm delivery."));
    } finally {
      setConfirmingId(null);
    }
  }

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("victimMyRequests.title")}</h1>

      {message && (
        <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-2 text-sm text-green-800">
          {message}
        </div>
      )}

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : requests.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("victimMyRequests.noRequests")}</p>
      ) : (
        <div className="mt-6 space-y-4">
          {requests.map((r) => {
            const requestDeliveries = deliveries[r.id] || [];
            return (
              <div key={r.id} className="rounded-xl border border-gray-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium capitalize text-gray-900">
                      {t(`disasterTypes.${r.disasterType}`, r.disasterType)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {t("victimRequestForm.severity")}:{" "}
                      <span className="capitalize">{t(`severities.${r.severity}`, r.severity)}</span> ·{" "}
                      {new Date(r.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>

                <div className="mt-3 divide-y divide-gray-100 border-t border-gray-100">
                  {(r.items || []).map((item) => {
                    const delivery = requestDeliveries.find(
                      (d) => d.category === item.category && d.donationId === item.donationId
                    );
                    return (
                      <div key={item.category} className="flex items-center justify-between py-2">
                        <span className="text-sm capitalize text-gray-700">
                          {t(`categories.${item.category}`, item.category)} ×{item.quantity}
                        </span>
                        <div className="flex items-center gap-2">
                          {delivery && CHATTABLE_STATUSES.has(delivery.status) && (
                            <button
                              onClick={() =>
                                setActiveChatId(`${delivery.id}_${delivery.method === "self" ? "donor_victim" : "volunteer_victim"}`)
                              }
                              className="rounded border border-gray-300 px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                            >
                              💬{" "}
                              {delivery.method === "self"
                                ? t("victimMyRequests.chatWithDonor")
                                : t("victimMyRequests.chatWithVolunteer")}
                            </button>
                          )}
                          {item.status === "pending" && (
                            <span className="text-xs text-gray-400">{t("victimMyRequests.awaitingMatch")}</span>
                          )}
                          {item.status === "matched" && !delivery && (
                            <span className="text-xs text-gray-400">
                              {t("victimMyRequests.awaitingVolunteer")}
                            </span>
                          )}
                          {item.status === "matched" && delivery && delivery.status === "delivered" && (
                            <button
                              disabled={confirmingId === delivery.id}
                              onClick={() => setScanning(true)}
                              className="rounded bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {confirmingId === delivery.id
                                ? t("victimMyRequests.confirming")
                                : t("victimMyRequests.scanToConfirm")}
                            </button>
                          )}
                          {item.status === "matched" && delivery && delivery.status !== "delivered" && (
                            <StatusBadge status={delivery.status} />
                          )}
                          {item.status === "delivered" && (
                            <span className="text-xs font-medium text-green-700">
                              {t("victimMyRequests.confirmed")}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scanning && <QrScanModal onScan={handleScan} onClose={() => setScanning(false)} />}
      {activeChatId && <ChatModal chatId={activeChatId} onClose={() => setActiveChatId(null)} />}
    </DashboardLayout>
  );
}
