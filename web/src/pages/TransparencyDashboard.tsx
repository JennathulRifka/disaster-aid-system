import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { StatCard } from "@/components/StatCard";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { apiFetch } from "@/lib/api";

interface Stats {
  totalRequests: number;
  requestsByStatus: Record<string, number>;
  requestsByDisasterType: Record<string, number>;
  totalDonations: number;
  donationsByStatus: Record<string, number>;
  completedDeliveries: number;
  totalVolunteers: number;
  districtsReached: number;
}

function BreakdownBar({
  title,
  data,
  labelFor,
  noDataLabel,
}: {
  title: string;
  data: Record<string, number>;
  labelFor: (key: string) => string;
  noDataLabel: string;
}) {
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <p className="mb-3 text-sm font-medium text-gray-700">{title}</p>
      <div className="space-y-2">
        {Object.entries(data).map(([key, count]) => (
          <div key={key}>
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span className="capitalize">{labelFor(key)}</span>
              <span>{count}</span>
            </div>
            <div className="h-2 w-full rounded-full bg-gray-100">
              <div
                className="h-2 rounded-full bg-blue-500"
                style={{ width: `${(count / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
        {Object.keys(data).length === 0 && <p className="text-xs text-gray-400">{noDataLabel}</p>}
      </div>
    </div>
  );
}

export default function TransparencyDashboard() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    apiFetch("/api/stats").then(setStats);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-lg font-semibold text-gray-900">{t("transparency.title")}</h1>
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
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
              <StatCard label={t("transparency.totalRequests")} value={stats.totalRequests} />
              <StatCard label={t("transparency.totalDonations")} value={stats.totalDonations} />
              <StatCard label={t("transparency.confirmedDeliveries")} value={stats.completedDeliveries} />
              <StatCard label={t("transparency.activeVolunteers")} value={stats.totalVolunteers} />
              <StatCard label={t("transparency.districtsReached")} value={stats.districtsReached} />
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <BreakdownBar
                title={t("transparency.requestsByStatus")}
                data={stats.requestsByStatus}
                labelFor={(key) => t(`status.${key}`, key.replace("_", " "))}
                noDataLabel={t("transparency.noDataYet")}
              />
              <BreakdownBar
                title={t("transparency.requestsByDisasterType")}
                data={stats.requestsByDisasterType}
                labelFor={(key) => t(`disasterTypes.${key}`, key)}
                noDataLabel={t("transparency.noDataYet")}
              />
              <BreakdownBar
                title={t("transparency.donationsByStatus")}
                data={stats.donationsByStatus}
                labelFor={(key) => t(`status.${key}`, key.replace("_", " "))}
                noDataLabel={t("transparency.noDataYet")}
              />
            </div>
          </>
        )}
      </main>
    </div>
  );
}
