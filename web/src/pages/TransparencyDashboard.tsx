import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { FileEdit, Gift, PackageCheck, Users2, Map, ListChecks, AlertTriangle, HandCoins, Truck, type LucideIcon } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { apiFetch } from "@/lib/api";

interface Stats {
  totalRequests: number;
  requestsByStatus: Record<string, number>;
  requestsByDisasterType: Record<string, number>;
  totalDonations: number;
  donationsByStatus: Record<string, number>;
  deliveriesByStatus: Record<string, number>;
  completedDeliveries: number;
  totalVolunteers: number;
  districtsReached: number;
}

// Solid bar colors matching StatusBadge.tsx's own semantic palette (pending =
// amber, in-flight = blue/purple, done = green, rejected = red) so a status
// reads the same color whether it's a table badge or a bar here.
const STATUS_BAR_COLOR: Record<string, string> = {
  pending: "bg-amber-400",
  pending_acceptance: "bg-amber-400",
  verified: "bg-blue-500",
  accepted: "bg-blue-500",
  available: "bg-blue-500",
  rejected: "bg-red-500",
  matched: "bg-purple-500",
  in_progress: "bg-purple-500",
  picked_up: "bg-purple-500",
  delivered: "bg-green-500",
  confirmed: "bg-green-500",
};
const statusBarColor = (key: string) => STATUS_BAR_COLOR[key] ?? "bg-gray-400";

const DISASTER_TYPE_COLOR: Record<string, string> = {
  flood: "bg-blue-500",
  landslide: "bg-amber-700",
  cyclone: "bg-purple-500",
  drought: "bg-orange-500",
  other: "bg-gray-400",
};
const disasterTypeColor = (key: string) => DISASTER_TYPE_COLOR[key] ?? "bg-gray-400";

function BreakdownBar({
  icon: Icon,
  title,
  data,
  labelFor,
  colorFor,
  noDataLabel,
}: {
  icon: LucideIcon;
  title: string;
  data: Record<string, number>;
  labelFor: (key: string) => string;
  colorFor: (key: string) => string;
  noDataLabel: string;
}) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((sum, [, count]) => sum + count, 0) || 1;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} className="text-gray-400" />
        <p className="text-sm font-medium text-gray-700">{title}</p>
      </div>
      <div className="space-y-3">
        {entries.map(([key, count]) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={key}>
              <div className="mb-1 flex items-baseline justify-between text-xs text-gray-600">
                <span className="capitalize">{labelFor(key)}</span>
                <span className="text-gray-400">
                  {count} · {pct}%
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div
                  className={`h-2 rounded-full ${colorFor(key)} transition-[width] duration-500`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {entries.length === 0 && <p className="text-xs text-gray-400">{noDataLabel}</p>}
      </div>
    </div>
  );
}

export default function TransparencyDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [nowTick, setNowTick] = useState(Date.now());

  // Auto-refresh every 30s — matches GET /api/stats' own server-side cache
  // TTL exactly (see server/src/routes/stats.js), so this never fetches more
  // often than the data could actually have changed.
  useEffect(() => {
    const load = () => {
      apiFetch("/api/stats")
        .then((data) => {
          setStats(data);
          setLastUpdated(Date.now());
        })
        .catch(() => {});
    };
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, []);

  // Ticks once a second purely to keep "Updated Xs ago" fresh in between
  // actual data refreshes — same "wall-clock-derived value needs its own
  // re-render trigger" pattern already used for AdminRequests.tsx's stale
  // badges, since a value derived from Date.now() won't update on its own.
  useEffect(() => {
    const tick = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);

  const secondsAgo = lastUpdated ? Math.max(0, Math.round((nowTick - lastUpdated) / 1000)) : null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">{t("transparency.title")}</h1>
          <p className="mt-0.5 text-xs text-gray-500">{t("transparency.subtitle")}</p>
        </div>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/" className="text-sm text-slate-700 hover:underline">
            {t("common.backToHome")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-10">
        {!stats ? (
          <p className="text-sm text-gray-500">{t("transparency.loadingLive")}</p>
        ) : (
          <>
            {secondsAgo !== null && (
              <div className="mb-4 flex items-center gap-2 text-xs text-gray-500">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                {t("transparency.updatedSecondsAgo", { seconds: secondsAgo })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard label={t("transparency.totalRequests")} value={stats.totalRequests} icon={FileEdit} accent="orange" />
              <StatCard label={t("transparency.totalDonations")} value={stats.totalDonations} icon={Gift} accent="blue" />
              <StatCard
                label={t("transparency.confirmedDeliveries")}
                value={stats.completedDeliveries}
                icon={PackageCheck}
                accent="green"
              />
              <StatCard label={t("transparency.activeVolunteers")} value={stats.totalVolunteers} icon={Users2} accent="purple" />
              <StatCard label={t("transparency.districtsReached")} value={stats.districtsReached} icon={Map} accent="slate" />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BreakdownBar
                icon={ListChecks}
                title={t("transparency.requestsByStatus")}
                data={stats.requestsByStatus}
                labelFor={(key) => t(`status.${key}`, key.replace("_", " "))}
                colorFor={statusBarColor}
                noDataLabel={t("transparency.noDataYet")}
              />
              <BreakdownBar
                icon={AlertTriangle}
                title={t("transparency.requestsByDisasterType")}
                data={stats.requestsByDisasterType}
                labelFor={(key) => t(`disasterTypes.${key}`, key)}
                colorFor={disasterTypeColor}
                noDataLabel={t("transparency.noDataYet")}
              />
              <BreakdownBar
                icon={HandCoins}
                title={t("transparency.donationsByStatus")}
                data={stats.donationsByStatus}
                labelFor={(key) => t(`status.${key}`, key.replace("_", " "))}
                colorFor={statusBarColor}
                noDataLabel={t("transparency.noDataYet")}
              />
              <BreakdownBar
                icon={Truck}
                title={t("transparency.deliveriesByStatus")}
                data={stats.deliveriesByStatus || {}}
                labelFor={(key) => t(`status.${key}`, key.replace("_", " "))}
                colorFor={statusBarColor}
                noDataLabel={t("transparency.noDataYet")}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
