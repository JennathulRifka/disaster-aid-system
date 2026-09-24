import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StatusBadge } from "@/components/StatusBadge";
import { DeliveryQrCode } from "@/components/DeliveryQrCode";
import { ChatModal } from "@/components/ChatModal";
import { apiFetch } from "@/lib/api";
import { deliveryChatId } from "@/lib/deliveryChat";
import { db } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

const NAVIGABLE_STATUSES = new Set(["accepted", "picked_up"]);
// Chats open once a volunteer accepts (see server/src/utils/deliveryChats.js)
// and stay usable through the rest of the delivery — not before acceptance
// (nothing to chat about yet) and not for a rejected assignment.
const CHATTABLE_STATUSES = new Set(["accepted", "picked_up", "delivered", "confirmed"]);

interface Delivery {
  id: string;
  requestId: string;
  donationId: string;
  category: string;
  status: string;
  createdAt: string;
  confirmToken?: string;
  handoffVersion?: number;
}

interface HandoffRequest {
  id: string;
  deliveryId: string;
  fromVolunteerId: string;
  toVolunteerId: string;
  category: string;
  destinationDistrict: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled";
  createdAt: string;
}

interface FellowTraveller {
  deliveryId: string;
  category: string;
  originDistrict: string | null;
  destinationDistrict: string | null;
  status: string;
}

// A delivery is worth showing fellow-traveller matches for once the
// volunteer has actually committed to it (matches the backend's own
// ACTIVE_DELIVERY_STATUSES in routes/deliveries.js).
const FELLOW_TRAVELLER_STATUSES = new Set(["accepted", "picked_up"]);

const NEXT_STATUS: Record<string, string> = {
  accepted: "picked_up",
  picked_up: "delivered",
};

export default function VolunteerDeliveries() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [handoffs, setHandoffs] = useState<HandoffRequest[]>([]);
  const [handoffActionOn, setHandoffActionOn] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingOn, setActingOn] = useState<string | null>(null);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [savingAvailability, setSavingAvailability] = useState(false);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationStatus, setLocationStatus] = useState<"idle" | "capturing" | "error">("idle");
  const [fellowTravellers, setFellowTravellers] = useState<Record<string, FellowTraveller[]>>({});
  const [fellowLoading, setFellowLoading] = useState<string | null>(null);
  const [sameOriginOnly, setSameOriginOnly] = useState<Record<string, boolean>>({});
  const [startingChatWith, setStartingChatWith] = useState<string | null>(null);

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

  // Handoff requests (Fellow Travellers Phase 2) live, either direction —
  // sent (I'm fromVolunteerId) or received (I'm toVolunteerId). Two queries
  // merged in JS, same reason chats.js's GET /mine does the same thing:
  // Firestore can't OR across two different fields in one query.
  useEffect(() => {
    if (!profile?.uid) return;
    const sent: HandoffRequest[] = [];
    const received: HandoffRequest[] = [];
    let unsubSent: () => void = () => {};
    let unsubReceived: () => void = () => {};

    function merge() {
      setHandoffs([...sent, ...received]);
    }

    unsubSent = onSnapshot(
      query(collection(db, "deliveryHandoffs"), where("fromVolunteerId", "==", profile.uid)),
      (snap) => {
        sent.length = 0;
        snap.docs.forEach((d) => sent.push({ id: d.id, ...d.data() } as HandoffRequest));
        merge();
      }
    );
    unsubReceived = onSnapshot(
      query(collection(db, "deliveryHandoffs"), where("toVolunteerId", "==", profile.uid)),
      (snap) => {
        received.length = 0;
        snap.docs.forEach((d) => received.push({ id: d.id, ...d.data() } as HandoffRequest));
        merge();
      }
    );
    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [profile?.uid]);

  const incomingHandoffs = useMemo(
    () => handoffs.filter((h) => h.toVolunteerId === profile?.uid && h.status === "pending"),
    [handoffs, profile?.uid]
  );
  const outgoingPendingByDelivery = useMemo(() => {
    const map: Record<string, HandoffRequest> = {};
    for (const h of handoffs) {
      if (h.fromVolunteerId === profile?.uid && h.status === "pending") map[h.deliveryId] = h;
    }
    return map;
  }, [handoffs, profile?.uid]);

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

  async function loadFellowTravellers(deliveryId: string) {
    setFellowLoading(deliveryId);
    try {
      const qs = sameOriginOnly[deliveryId] ? "?sameOrigin=true" : "";
      const data = await apiFetch(`/api/deliveries/${deliveryId}/fellow-travellers${qs}`);
      setFellowTravellers((prev) => ({ ...prev, [deliveryId]: data }));
    } finally {
      setFellowLoading(null);
    }
  }

  async function messageFellowTraveller(deliveryId: string, otherDeliveryId: string) {
    setStartingChatWith(otherDeliveryId);
    try {
      const { chatId } = await apiFetch(`/api/deliveries/${deliveryId}/fellow-travellers/${otherDeliveryId}/chat`, {
        method: "POST",
      });
      setActiveChatId(chatId);
    } finally {
      setStartingChatWith(null);
    }
  }

  async function requestHandoff(deliveryId: string, otherDeliveryId: string) {
    if (!window.confirm(t("volunteerDeliveries.handoffConfirm"))) return;
    setHandoffActionOn(otherDeliveryId);
    try {
      await apiFetch(`/api/deliveries/${deliveryId}/handoff`, {
        method: "POST",
        body: JSON.stringify({ otherDeliveryId }),
      });
    } finally {
      setHandoffActionOn(null);
    }
  }

  async function respondToHandoff(handoffId: string, decision: "accept" | "decline") {
    setHandoffActionOn(handoffId);
    try {
      await apiFetch(`/api/deliveries/handoffs/${handoffId}/${decision}`, { method: "PATCH" });
      if (decision === "accept") await load(); // the delivery now belongs to us — pull it into the list
    } finally {
      setHandoffActionOn(null);
    }
  }

  async function cancelHandoff(handoffId: string) {
    setHandoffActionOn(handoffId);
    try {
      await apiFetch(`/api/deliveries/handoffs/${handoffId}/cancel`, { method: "PATCH" });
    } finally {
      setHandoffActionOn(null);
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

      {incomingHandoffs.length > 0 && (
        <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4">
          <p className="text-sm font-medium text-orange-900">{t("volunteerDeliveries.handoffIncomingTitle")}</p>
          <ul className="mt-2 space-y-2">
            {incomingHandoffs.map((h) => (
              <li key={h.id} className="flex items-center justify-between rounded border border-orange-200 bg-white px-3 py-2 text-sm">
                <span className="text-gray-700">
                  {t(`categories.${h.category}`, h.category)} — {h.destinationDistrict || "?"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={handoffActionOn === h.id}
                    onClick={() => respondToHandoff(h.id, "accept")}
                    className="rounded bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                  >
                    {t("volunteerDeliveries.handoffAccept")}
                  </button>
                  <button
                    disabled={handoffActionOn === h.id}
                    onClick={() => respondToHandoff(h.id, "decline")}
                    className="rounded bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                  >
                    {t("volunteerDeliveries.handoffDecline")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
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
                  <p className="text-sm font-medium capitalize text-gray-900">
                    {t(`categories.${d.category}`, d.category)} —{" "}
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
                        onClick={() => setActiveChatId(deliveryChatId(d.id, "donor_volunteer", d.handoffVersion))}
                        className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        💬 {t("volunteerDeliveries.chatDonor")}
                      </button>
                      <button
                        onClick={() => setActiveChatId(deliveryChatId(d.id, "volunteer_victim", d.handoffVersion))}
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
                  <DeliveryQrCode
                    deliveryId={d.id}
                    token={d.confirmToken}
                    details={t(`categories.${d.category}`, d.category)}
                  />
                </div>
              )}

              {FELLOW_TRAVELLER_STATUSES.has(d.status) && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-medium text-gray-600">
                      {t("volunteerDeliveries.fellowTravellersTitle")}
                    </p>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-500">
                        <input
                          type="checkbox"
                          checked={!!sameOriginOnly[d.id]}
                          onChange={(e) => setSameOriginOnly((prev) => ({ ...prev, [d.id]: e.target.checked }))}
                        />
                        {t("volunteerDeliveries.fellowTravellersSameOrigin")}
                      </label>
                      <button
                        onClick={() => loadFellowTravellers(d.id)}
                        disabled={fellowLoading === d.id}
                        className="rounded border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {fellowLoading === d.id
                          ? t("common.loading")
                          : t("volunteerDeliveries.fellowTravellersFind")}
                      </button>
                    </div>
                  </div>

                  {outgoingPendingByDelivery[d.id] ? (
                    <div className="mt-2 flex items-center justify-between rounded border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800">
                      <span>{t("volunteerDeliveries.handoffPending")}</span>
                      <button
                        disabled={handoffActionOn === outgoingPendingByDelivery[d.id].id}
                        onClick={() => cancelHandoff(outgoingPendingByDelivery[d.id].id)}
                        className="rounded border border-amber-300 bg-white px-2 py-1 font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {t("volunteerDeliveries.handoffCancel")}
                      </button>
                    </div>
                  ) : (
                    fellowTravellers[d.id] &&
                    (fellowTravellers[d.id].length === 0 ? (
                      <p className="mt-2 text-xs text-gray-500">{t("volunteerDeliveries.fellowTravellersNone")}</p>
                    ) : (
                      <ul className="mt-2 space-y-1.5">
                        {fellowTravellers[d.id].map((ft) => (
                          <li
                            key={ft.deliveryId}
                            className="flex items-center justify-between rounded border border-gray-100 bg-gray-50 px-2.5 py-1.5 text-xs"
                          >
                            <span className="text-gray-700">
                              {t(`categories.${ft.category}`, ft.category)} · {ft.originDistrict || "?"} →{" "}
                              {ft.destinationDistrict || "?"}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                disabled={startingChatWith === ft.deliveryId}
                                onClick={() => messageFellowTraveller(d.id, ft.deliveryId)}
                                className="rounded border border-gray-300 bg-white px-2 py-1 font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                              >
                                💬 {t("volunteerDeliveries.fellowTravellersMessage")}
                              </button>
                              <button
                                disabled={handoffActionOn === ft.deliveryId}
                                onClick={() => requestHandoff(d.id, ft.deliveryId)}
                                className="rounded border border-orange-300 bg-orange-50 px-2 py-1 font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                              >
                                {t("volunteerDeliveries.handoffButton")}
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ))
                  )}
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
