import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/context/AuthContext";
import { logoutUser } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { NotificationSetup } from "@/components/NotificationSetup";
import { SosButton } from "@/components/SosButton";
import { SosStatusBanner } from "@/components/SosStatusBanner";

interface NavItem {
  labelKey: string;
  path: string;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  victim: [
    { labelKey: "nav.submitRequest", path: "/request/new" },
    { labelKey: "nav.myRequests", path: "/request/mine" },
  ],
  donor: [
    { labelKey: "nav.registerDonation", path: "/donations/new" },
    { labelKey: "nav.myDonations", path: "/donations/mine" },
  ],
  admin: [
    { labelKey: "nav.sosDispatch", path: "/admin/sos" },
    { labelKey: "nav.aidRequests", path: "/admin/requests" },
    { labelKey: "nav.donations", path: "/admin/donations" },
    { labelKey: "nav.situationMap", path: "/admin/map" },
    { labelKey: "nav.categories", path: "/admin/categories" },
    { labelKey: "nav.broadcast", path: "/admin/broadcast" },
    { labelKey: "nav.activeDistricts", path: "/admin/active-emergencies" },
    { labelKey: "nav.waterAlerts", path: "/admin/water-alerts" },
    { labelKey: "nav.communityReports", path: "/admin/community-reports" },
    { labelKey: "nav.resourceGap", path: "/admin/resource-gap" },
    { labelKey: "nav.auditLog", path: "/admin/audit-log" },
    { labelKey: "nav.volunteerWorkload", path: "/admin/volunteer-workload" },
  ],
  volunteer: [{ labelKey: "nav.myDeliveries", path: "/deliveries/mine" }],
};

export function DashboardLayout({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const location = useLocation();
  const { t } = useTranslation();
  const navItems = profile ? NAV_BY_ROLE[profile.role] || [] : [];

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <EmergencyBanner />
      <SosStatusBanner />
      <NotificationSetup />
      {/* Hidden on the SOS dispatch board itself — an admin managing incoming
          reports doesn't need a floating shortcut to submit a new one here. */}
      {location.pathname !== "/admin/sos" && <SosButton />}
      <div className="flex flex-1">
        <aside className="flex w-64 shrink-0 flex-col bg-slate-900">
          <div className="shrink-0 border-b border-slate-700 px-6 py-5">
            <h2 className="text-lg font-semibold text-white">Disaster Aid</h2>
            <p className="text-xs text-slate-400">Sri Lanka</p>
            <LanguageSwitcher className="mt-3" />
          </div>

          <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
            <Link
              to="/dashboard"
              className={`rounded px-3 py-2 text-sm font-medium ${
                location.pathname === "/dashboard"
                  ? "bg-orange-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {t("nav.overview")}
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  location.pathname === item.path
                    ? "bg-orange-600 text-white"
                    : "text-slate-300 hover:bg-slate-800 hover:text-white"
                }`}
              >
                {t(item.labelKey)}
              </Link>
            ))}
            <Link
              to="/settings"
              className={`rounded px-3 py-2 text-sm font-medium ${
                location.pathname === "/settings"
                  ? "bg-orange-600 text-white"
                  : "text-slate-300 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {t("nav.settings")}
            </Link>
          </nav>

          <div className="shrink-0 border-t border-slate-700 p-4">
            <p className="mb-2 truncate text-sm font-medium text-white">{profile?.name}</p>
            <p className="mb-3 text-xs capitalize text-slate-400">{profile?.role}</p>
            <button
              onClick={() => logoutUser()}
              className="w-full rounded bg-slate-800 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-700"
            >
              {t("common.logOut")}
            </button>
          </div>
        </aside>

        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
