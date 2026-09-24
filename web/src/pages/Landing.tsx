import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { LifeBuoy, Gift, Truck, FileEdit, Users2, PackageCheck, Map } from "lucide-react";
import { AreaSeverityMap } from "@/components/AreaSeverityMap";
import { EmergencyBanner } from "@/components/EmergencyBanner";
import { StatCard } from "@/components/StatCard";
import { ScrollReveal } from "@/components/ScrollReveal";
import { Footer } from "@/components/Footer";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { MapWalkthroughModal } from "@/components/MapWalkthroughModal";
import { useMapWalkthrough } from "@/hooks/useMapWalkthrough";
import { apiFetch } from "@/lib/api";

interface Stats {
  totalRequests: number;
  completedDeliveries: number;
  totalVolunteers: number;
  districtsReached: number;
}

interface WeatherCity {
  city: string;
  tempC: number | null;
  icon: string | null;
  description: string | null;
  error?: boolean;
}

const HOW_IT_WORKS = [
  { icon: FileEdit, titleKey: "landing.step1Title", shortDescKey: "landing.step1ShortDesc" },
  { icon: Users2, titleKey: "landing.step2Title", shortDescKey: "landing.step2ShortDesc" },
  { icon: PackageCheck, titleKey: "landing.step3Title", shortDescKey: "landing.step3ShortDesc" },
];

export default function Landing() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [weather, setWeather] = useState<WeatherCity[]>([]);
  const walkthrough = useMapWalkthrough();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    apiFetch("/api/stats").then(setStats);
    apiFetch("/api/external/weather").then(setWeather);
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <MapWalkthroughModal open={walkthrough.open} onClose={walkthrough.dismiss} />
      <EmergencyBanner />
      <header
        className={`sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 bg-white/90 px-4 py-4 backdrop-blur transition-shadow sm:px-8 sm:py-6 ${
          scrolled ? "shadow-sm" : ""
        }`}
      >
        <h1 className="whitespace-nowrap text-base font-semibold text-gray-900 sm:text-lg">{t("landing.brand")}</h1>
        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <LanguageSwitcher />
          <AccessibilityControls onShowHelp={walkthrough.show} />
          <Link to="/login" className="rounded px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 sm:px-4 sm:py-2">
            {t("common.signIn")}
          </Link>
          <Link
            to="/register"
            className="rounded bg-orange-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-orange-700 hover:shadow sm:px-4 sm:py-2"
          >
            {t("common.getStarted")}
          </Link>
        </div>
      </header>

      <section className="relative overflow-hidden bg-gradient-to-b from-slate-50 via-white to-white">
        {/* Decorative blurred accents — pure CSS, no images, kept subtle */}
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-slate-200 opacity-30 blur-3xl"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute -right-24 top-10 h-80 w-80 rounded-full bg-orange-200 opacity-30 blur-3xl"
          aria-hidden="true"
        />

        <div className="relative mx-auto max-w-3xl px-8 pb-8 pt-16 text-center sm:pt-20">
          <h2 className="text-4xl font-bold leading-tight text-gray-900">{t("landing.heroTitle")}</h2>
          <p className="mt-4 text-lg text-gray-600">{t("landing.heroSubtitle")}</p>
          <div className="mt-8 flex justify-center gap-4">
            <Link
              to="/register"
              className="rounded bg-orange-600 px-6 py-3 font-medium text-white shadow-sm transition hover:-translate-y-0.5 hover:bg-orange-700 hover:shadow-md"
            >
              {t("landing.ctaRequestOrGive")}
            </Link>
            <Link
              to="/transparency"
              className="rounded border border-gray-300 bg-white px-6 py-3 font-medium text-gray-700 transition hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md"
            >
              {t("landing.ctaViewDashboard")}
            </Link>
          </div>

          {stats && (
            <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
              <StatCard label={t("landing.statRequests")} value={stats.totalRequests} />
              <StatCard label={t("landing.statDeliveries")} value={stats.completedDeliveries} />
              <StatCard label={t("landing.statVolunteers")} value={stats.totalVolunteers} />
              <StatCard label={t("landing.statDistricts")} value={stats.districtsReached} />
            </div>
          )}
        </div>

        {/* Wavy divider into the next section */}
        <svg
          className="relative block h-10 w-full text-white"
          viewBox="0 0 1200 40"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path d="M0,20 C300,45 900,-5 1200,20 L1200,40 L0,40 Z" fill="currentColor" />
        </svg>
      </section>

      <ScrollReveal>
        <section className="mx-auto max-w-4xl px-8 pb-8 pt-2">
          <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-4">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.titleKey} className="flex max-w-[180px] items-start gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-50 text-orange-600">
                  <step.icon size={15} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">{t(step.titleKey)}</p>
                  <p className="text-xs text-gray-500">{t(step.shortDescKey)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="mx-auto max-w-4xl px-8 pb-12">
          {weather.length > 0 && (
            <div className="mb-6 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {t("landing.currentConditions")}
              </h4>
              <div className="flex flex-wrap gap-3 overflow-x-auto">
                {weather
                  .filter((w) => !w.error)
                  .map((w) => (
                    <div
                      key={w.city}
                      className="flex shrink-0 items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1 pr-3 text-xs text-gray-700"
                    >
                      {w.icon && (
                        <img
                          src={`https://openweathermap.org/img/wn/${w.icon}.png`}
                          alt={w.description || ""}
                          className="h-6 w-6"
                        />
                      )}
                      <span className="font-medium">{w.city}</span>
                      <span>{w.tempC}°C</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h3 className="text-xl font-semibold text-gray-900">{t("landing.affectedAreasTitle")}</h3>
              <p className="mt-1 text-sm text-gray-600">{t("landing.affectedAreasDesc")}</p>
            </div>
            <Link
              to="/severity-map"
              className="flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-medium text-orange-700 transition hover:border-orange-300 hover:bg-orange-100"
            >
              <Map className="h-4 w-4" />
              {t("landing.viewFullMap")}
            </Link>
          </div>
          <AreaSeverityMap height="420px" extraLayers />
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="mx-auto max-w-4xl px-8 pb-12">
          <div className="flex flex-wrap items-start justify-center gap-x-10 gap-y-4">
            <div className="flex max-w-[180px] items-start gap-2">
              <LifeBuoy className="mt-0.5 shrink-0 text-slate-700" size={18} />
              <div>
                <p className="text-sm font-medium text-gray-800">{t("landing.forVictimsTitle")}</p>
                <p className="text-xs text-gray-500">{t("landing.forVictimsShortDesc")}</p>
              </div>
            </div>
            <div className="flex max-w-[180px] items-start gap-2">
              <Gift className="mt-0.5 shrink-0 text-slate-700" size={18} />
              <div>
                <p className="text-sm font-medium text-gray-800">{t("landing.forDonorsTitle")}</p>
                <p className="text-xs text-gray-500">{t("landing.forDonorsShortDesc")}</p>
              </div>
            </div>
            <div className="flex max-w-[180px] items-start gap-2">
              <Truck className="mt-0.5 shrink-0 text-slate-700" size={18} />
              <div>
                <p className="text-sm font-medium text-gray-800">{t("landing.forVolunteersTitle")}</p>
                <p className="text-xs text-gray-500">{t("landing.forVolunteersShortDesc")}</p>
              </div>
            </div>
          </div>
        </section>
      </ScrollReveal>

      <Footer />
    </div>
  );
}
