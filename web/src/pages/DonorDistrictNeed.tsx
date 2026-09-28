import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { DashboardLayout } from "@/components/DashboardLayout";
import { apiFetch } from "@/lib/api";

interface DistrictNeedRow {
  district: string;
  category: string;
  pendingCount: number;
  pendingQuantity: number;
}

// A donor's own client can't read other victims' aidRequests documents
// directly (Firestore rules correctly restrict that to the request's own
// victim or an admin), so unlike AdminDistrictInventory.tsx this can't be a
// live onSnapshot view — it polls the public, aggregate-only
// GET /api/stats/district-need endpoint instead (see "Donation
// leftover-quantity tracking & district inventory" in CLAUDE.md). 30s
// refresh approximates "live" without needing to relax any privacy rule.
const REFRESH_MS = 30_000;

export default function DonorDistrictNeed() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<DistrictNeedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const data = await apiFetch("/api/stats/district-need");
        if (!cancelled) setRows(data);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    const interval = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Plain substring filter, not the map-oriented DistrictSearchBox used
  // elsewhere in this app (CountrySearchBox/DistrictSearchBox select one
  // district to zoom a map to) — this is a table with no map, so a
  // type-to-filter text input over the already-fetched rows is the natural
  // fit, same pattern AdminRequests.tsx's own free-text filters already use.
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => row.district.toLowerCase().includes(q));
  }, [rows, search]);

  // Overall need — direct user ask for a "live dashboard" view, not just a
  // flat district×category table: totals per category across every
  // district, worst-shortage first. Purely a client-side re-aggregation of
  // the same already-fetched, already-live-polled `rows` — no new endpoint.
  const totalsByCategory = useMemo(() => {
    const byCategory: Record<string, { pendingQuantity: number; pendingCount: number; districtCount: number }> = {};
    for (const row of rows) {
      if (!byCategory[row.category]) {
        byCategory[row.category] = { pendingQuantity: 0, pendingCount: 0, districtCount: 0 };
      }
      byCategory[row.category].pendingQuantity += row.pendingQuantity;
      byCategory[row.category].pendingCount += row.pendingCount;
      byCategory[row.category].districtCount += 1;
    }
    return Object.entries(byCategory)
      .map(([category, totals]) => ({ category, ...totals }))
      .sort((a, b) => b.pendingQuantity - a.pendingQuantity);
  }, [rows]);

  // The per-district breakdown grouped by district (worst-hit district
  // first) rather than the old flat district×category row list — "each
  // district, all the stuff in need," per the user's own phrasing — computed
  // over the already-filtered set so the search box still narrows this too.
  const byDistrict = useMemo(() => {
    const grouped: Record<string, DistrictNeedRow[]> = {};
    for (const row of filteredRows) {
      if (!grouped[row.district]) grouped[row.district] = [];
      grouped[row.district].push(row);
    }
    return Object.entries(grouped)
      .map(([district, districtRows]) => ({
        district,
        rows: districtRows.sort((a, b) => b.pendingQuantity - a.pendingQuantity),
        totalQuantity: districtRows.reduce((sum, r) => sum + r.pendingQuantity, 0),
      }))
      .sort((a, b) => b.totalQuantity - a.totalQuantity);
  }, [filteredRows]);

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("donorDistrictNeed.title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("donorDistrictNeed.subtitle")}</p>

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">{t("donorDistrictNeed.noNeed")}</p>
      ) : (
        <>
          <h2 className="mt-6 text-sm font-semibold uppercase tracking-wide text-gray-700">
            {t("donorDistrictNeed.overallTitle")}
          </h2>
          <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {totalsByCategory.map((c) => (
              <div key={c.category} className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs capitalize text-gray-500">{t(`categories.${c.category}`, c.category)}</p>
                <p className="mt-1 text-2xl font-semibold text-gray-900">{c.pendingQuantity}</p>
                <p className="mt-1 text-xs text-gray-400">
                  {t("donorDistrictNeed.overallCaption", {
                    count: c.pendingCount,
                    districts: c.districtCount,
                  })}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-700">
              {t("donorDistrictNeed.byDistrictTitle")}
            </h2>
            <div className="relative w-full sm:w-72">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("donorDistrictNeed.searchPlaceholder")}
                aria-label={t("donorDistrictNeed.searchPlaceholder")}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-8 text-sm focus:border-orange-500 focus:outline-none"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  aria-label={t("common.close")}
                  title={t("common.close")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {byDistrict.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">{t("donorDistrictNeed.noMatch")}</p>
          ) : (
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {byDistrict.map(({ district, rows: districtRows }) => (
                <div key={district} className="rounded-xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-900">{district}</p>
                  <div className="mt-2 space-y-1.5">
                    {districtRows.map((row) => (
                      <div key={row.category} className="flex items-center justify-between text-xs">
                        <span className="capitalize text-gray-600">
                          {t(`categories.${row.category}`, row.category)}
                        </span>
                        <span className="font-medium text-gray-900">
                          {row.pendingQuantity}{" "}
                          <span className="font-normal text-gray-400">
                            ({row.pendingCount} {t("donorDistrictNeed.pendingRequests").toLowerCase()})
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
