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

  return (
    <DashboardLayout>
      <h1 className="text-2xl font-semibold text-gray-900">{t("donorDistrictNeed.title")}</h1>
      <p className="mt-1 text-sm text-gray-600">{t("donorDistrictNeed.subtitle")}</p>

      <div className="relative mt-4 w-full sm:w-72">
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

      {loading ? (
        <p className="mt-4 text-sm text-gray-500">{t("common.loading")}</p>
      ) : (
        <div className="mt-4 overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">{t("donorDistrictNeed.district")}</th>
                <th className="px-4 py-3">{t("donorDistrictNeed.category")}</th>
                <th className="px-4 py-3">{t("donorDistrictNeed.stillNeeded")}</th>
                <th className="px-4 py-3">{t("donorDistrictNeed.pendingRequests")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredRows.map((row) => (
                <tr key={`${row.district}::${row.category}`}>
                  <td className="px-4 py-3">{row.district}</td>
                  <td className="px-4 py-3 capitalize">{t(`categories.${row.category}`, row.category)}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{row.pendingQuantity}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{row.pendingCount}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-500">
                    {rows.length === 0 ? t("donorDistrictNeed.noNeed") : t("donorDistrictNeed.noMatch")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </DashboardLayout>
  );
}
