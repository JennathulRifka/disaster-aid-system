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
  { icon: FileEdit, titleKey: "landing.step1Title", descKey: "landing.step1Desc" },
  { icon: Users2, titleKey: "landing.step2Title", descKey: "landing.step2Desc" },
  { icon: PackageCheck, titleKey: "landing.step3Title", descKey: "landing.step3Desc" },
];

export default function Landing() {
  const { t } = useTranslation();
  const [scrolled, setScrolled] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [weather, setWeather] = useState<WeatherCity[]>([]);

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
      <EmergencyBanner />
      <header
        className={`sticky top-0 z-10 flex items-center justify-between bg-white/90 px-8 py-6 backdrop-blur transition-shadow ${
          scrolled ? "shadow-sm" : ""
        }`}
      >
        <h1 className="text-lg font-semibold text-gray-900">{t("landing.brand")}</h1>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <Link to="/login" className="rounded px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100">
            {t("common.signIn")}
          </Link>
          <Link
            to="/register"
            className="rounded bg-orange-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-orange-700 hover:shadow"
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

        <div className="relative mx-auto max-w-3xl px-8 py-24 text-center">
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
            <div className="mt-14 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
        <section className="mx-auto max-w-4xl px-8 py-16">
          <h3 className="text-center text-xl font-semibold text-gray-900">{t("landing.howItWorksTitle")}</h3>
          <div className="relative mt-10 grid grid-cols-1 gap-10 sm:grid-cols-3">
            <div className="absolute left-0 right-0 top-6 hidden h-px bg-gray-200 sm:block" />
            {HOW_IT_WORKS.map((step, i) => (
              <div key={step.titleKey} className="relative flex flex-col items-center text-center">
                <div className="z-10 flex h-12 w-12 items-center justify-center rounded-full bg-orange-600 text-white shadow-sm">
                  <step.icon size={22} />
                </div>
                <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-orange-600">
                  {t("common.step", { number: i + 1 })}
                </p>
                <h4 className="mt-1 font-semibold text-gray-900">{t(step.titleKey)}</h4>
                <p className="mt-1 text-sm text-gray-600">{t(step.descKey)}</p>
              </div>
            ))}
          </div>
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="mx-auto max-w-4xl px-8 pb-16">
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
          {weather.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-3 overflow-x-auto">
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
          )}
          <AreaSeverityMap height="420px" extraLayers />
        </section>
      </ScrollReveal>

      <ScrollReveal>
        <section className="mx-auto grid max-w-4xl grid-cols-1 gap-6 px-8 pb-24 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 p-6 transition hover:-translate-y-1 hover:shadow-md">
            <LifeBuoy className="text-slate-700" size={24} />
            <h3 className="mt-3 font-semibold text-gray-900">{t("landing.forVictimsTitle")}</h3>
            <p className="mt-2 text-sm text-gray-600">{t("landing.forVictimsDesc")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-6 transition hover:-translate-y-1 hover:shadow-md">
            <Gift className="text-slate-700" size={24} />
            <h3 className="mt-3 font-semibold text-gray-900">{t("landing.forDonorsTitle")}</h3>
            <p className="mt-2 text-sm text-gray-600">{t("landing.forDonorsDesc")}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-6 transition hover:-translate-y-1 hover:shadow-md">
            <Truck className="text-slate-700" size={24} />
            <h3 className="mt-3 font-semibold text-gray-900">{t("landing.forVolunteersTitle")}</h3>
            <p className="mt-2 text-sm text-gray-600">{t("landing.forVolunteersDesc")}</p>
          </div>
        </section>
      </ScrollReveal>

      <Footer />
    </div>
  );
}
