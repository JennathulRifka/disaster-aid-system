import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { CheckCircle2, AlertTriangle, AlertOctagon } from "lucide-react";
import { AreaSeverityMap } from "@/components/AreaSeverityMap";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AccessibilityControls } from "@/components/AccessibilityControls";
import { MapWalkthroughModal } from "@/components/MapWalkthroughModal";
import { InfoDisclosure } from "@/components/InfoDisclosure";
import { useMapWalkthrough } from "@/hooks/useMapWalkthrough";
import { apiFetch } from "@/lib/api";

interface Alert {
  title: string;
  link: string | null;
  pubDate: string | null;
  summary: string;
}

interface GdacsEvent {
  eventId: number | null;
  eventType: string | null;
  eventName: string | null;
  alertLevel: string | null;
  title: string;
  summary: string;
  link: string | null;
  fromDate: string | null;
  toDate: string | null;
  country: string | null;
}

const GDACS_EVENT_TYPE_LABEL: Record<string, string> = {
  TC: "Tropical Cyclone",
  EQ: "Earthquake",
  FL: "Flood",
  DR: "Drought",
  WF: "Wildfire",
  VO: "Volcano",
};

const GDACS_ALERT_COLOR: Record<string, string> = {
  Green: "bg-green-100 text-green-800",
  Orange: "bg-amber-100 text-amber-800",
  Red: "bg-red-100 text-red-800",
};

// Color alone isn't accessible — every risk/alert badge on this page also
// gets one of these icons, same "check / warning / danger" vocabulary used
// on the map itself (AreaSeverityMap.tsx), so a colorblind or non-reading
// visitor still gets the message.
const GDACS_ALERT_ICON: Record<string, typeof CheckCircle2> = {
  Green: CheckCircle2,
  Orange: AlertTriangle,
  Red: AlertOctagon,
};

interface Earthquake {
  id: string;
  magnitude: number;
  place: string;
  time: string;
  depthKm: number | null;
  tsunami: boolean;
  url: string;
}

function magnitudeColor(mag: number): string {
  if (mag >= 6) return "bg-red-100 text-red-800";
  if (mag >= 5) return "bg-amber-100 text-amber-800";
  return "bg-gray-100 text-gray-700";
}

function MagnitudeIcon({ mag }: { mag: number }) {
  const Icon = mag >= 6 ? AlertOctagon : mag >= 5 ? AlertTriangle : CheckCircle2;
  return <Icon size={12} />;
}

interface WeatherCity {
  city: string;
  district: string;
  tempC: number | null;
  feelsLikeC: number | null;
  condition: string | null;
  description: string | null;
  icon: string | null;
  humidity: number | null;
  windSpeedMs: number | null;
  rainLastHourMm: number;
  error?: boolean;
}

interface CommunityReport {
  id: string;
  type: "road_closure" | "water_level" | "other";
  description: string;
  district: string;
  verifiedAt: string;
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  road_closure: "Road closure",
  water_level: "Water level / flooding",
  other: "Other condition",
};

interface Reservoir {
  name: string;
  size: "major" | "medium" | "hydropower";
  source: "irrigation_department" | "ceb_mahaweli";
  district: string | null;
  effectiveStoragePercent: number | null;
  levelMsl?: number | null;
  rainfallMm: number | null;
  date: string | null;
  riskLevel: "normal" | "elevated" | "high" | "spilling";
}

const RESERVOIR_RISK_BADGE: Record<string, string> = {
  elevated: "bg-amber-100 text-amber-800",
  high: "bg-orange-100 text-orange-800",
  spilling: "bg-red-100 text-red-800",
};

const RESERVOIR_RISK_ICON: Record<string, typeof CheckCircle2> = {
  elevated: AlertTriangle,
  high: AlertTriangle,
  spilling: AlertOctagon,
};

export default function PublicSeverityMap() {
  const { t } = useTranslation();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [gdacsEvents, setGdacsEvents] = useState<GdacsEvent[]>([]);
  const [gdacsScope, setGdacsScope] = useState<"sri-lanka" | "global">("sri-lanka");
  const [gdacsLoading, setGdacsLoading] = useState(true);
  const [earthquakes, setEarthquakes] = useState<Earthquake[]>([]);
  const [earthquakeScope, setEarthquakeScope] = useState<"sri-lanka" | "regional">("sri-lanka");
  const [earthquakesLoading, setEarthquakesLoading] = useState(true);
  const [communityReports, setCommunityReports] = useState<CommunityReport[]>([]);
  const [weather, setWeather] = useState<WeatherCity[]>([]);
  const [reservoirs, setReservoirs] = useState<Reservoir[]>([]);
  const [showAllReservoirs, setShowAllReservoirs] = useState(false);
  const walkthrough = useMapWalkthrough();

  useEffect(() => {
    apiFetch("/api/external/alerts").then(setAlerts);
    apiFetch("/api/community-reports/verified").then(setCommunityReports);
    apiFetch("/api/external/weather").then(setWeather);
    apiFetch("/api/external/reservoirs").then(setReservoirs);
  }, []);

  // Defaults to Sri-Lanka-relevant (usually empty, an honest reflection of
  // how rarely GDACS has an active event here) with a "view global events"
  // fallback — same pattern as the earthquake scope toggle just below, kept
  // as its own independent state (not shared with AreaSeverityMap's copy of
  // this same toggle on the map above), consistent with how this page's
  // admin equivalent treats GDACS/earthquake scope as independent too.
  useEffect(() => {
    setGdacsLoading(true);
    apiFetch(`/api/external/gdacs?scope=${gdacsScope}`)
      .then(setGdacsEvents)
      .finally(() => setGdacsLoading(false));
  }, [gdacsScope]);

  // Defaults to Sri-Lanka-only (usually empty, an honest reflection of real
  // seismic activity) with a "view global events" fallback once that comes
  // back empty — same pattern as the admin map's GDACS/earthquake scope
  // toggles, extended to the public page.
  useEffect(() => {
    setEarthquakesLoading(true);
    apiFetch(`/api/external/earthquakes?scope=${earthquakeScope}`)
      .then(setEarthquakes)
      .finally(() => setEarthquakesLoading(false));
  }, [earthquakeScope]);

  function renderReservoirItem(r: Reservoir) {
    return (
      <li key={r.name} className="rounded border border-gray-200 bg-white p-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          {r.riskLevel !== "normal" && (
            <span
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${RESERVOIR_RISK_BADGE[r.riskLevel]}`}
            >
              {(() => {
                const Icon = RESERVOIR_RISK_ICON[r.riskLevel] ?? AlertTriangle;
                return <Icon size={12} />;
              })()}
              {t(`severityMap.reservoirRisk${r.riskLevel.charAt(0).toUpperCase()}${r.riskLevel.slice(1)}`)}
            </span>
          )}
          <span className="text-sm font-medium text-gray-900">{r.name}</span>
          {r.district && <span className="text-sm text-gray-500">— {r.district}</span>}
        </div>
        <p className="mt-1 text-gray-600">
          {r.effectiveStoragePercent != null
            ? t("severityMap.reservoirCapacity", { pct: r.effectiveStoragePercent })
            : t("severityMap.reservoirCapacityUnknown")}
          {r.levelMsl != null && ` · ${r.levelMsl} m MSL`}
          {r.rainfallMm != null && r.rainfallMm > 0 && ` · ${t("severityMap.reservoirRain", { mm: r.rainfallMm })}`}
        </p>
        {r.date && <p className="mt-1 text-xs text-gray-400">{t("severityMap.reservoirAsOf", { date: r.date })}</p>}
      </li>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <MapWalkthroughModal open={walkthrough.open} onClose={walkthrough.dismiss} />
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-8 py-5">
        <h1 className="text-lg font-semibold text-gray-900">{t("severityMap.title")}</h1>
        <div className="flex items-center gap-3">
          <LanguageSwitcher />
          <AccessibilityControls onShowHelp={walkthrough.show} />
          <Link to="/" className="text-sm text-slate-700 hover:underline">
            {t("common.backToHome")}
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-8 py-8">
        <p className="mb-4 text-sm text-gray-600">{t("severityMap.description")}</p>

        <AreaSeverityMap height="600px" extraLayers />

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.weatherTitle")}</h2>
          <p className="mt-1 text-xs text-gray-400">{t("severityMap.weatherCaption")}</p>
          {weather.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{t("severityMap.weatherUnavailable")}</p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {weather
                .filter((w) => !w.error)
                .map((w) => (
                  <div key={w.city} className="rounded border border-gray-200 bg-white p-3 text-center text-sm">
                    <p className="font-medium text-gray-900">{w.city}</p>
                    {w.icon && (
                      <img
                        src={`https://openweathermap.org/img/wn/${w.icon}@2x.png`}
                        alt={w.description || ""}
                        className="mx-auto h-10 w-10"
                      />
                    )}
                    <p className="text-lg font-semibold text-gray-900">{w.tempC}°C</p>
                    <p className="text-xs capitalize text-gray-500">{w.description}</p>
                    {w.rainLastHourMm > 0 && (
                      <p className="mt-1 rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {t("severityMap.weatherRain", { mm: w.rainLastHourMm })}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.reservoirsTitle")}</h2>
          <InfoDisclosure summary={t("severityMap.reservoirsSimpleCaption")} details={t("severityMap.reservoirsCaption")} />

          {(() => {
            const irrigation = reservoirs.filter((r) => r.source === "irrigation_department");
            const flagged = irrigation.filter((r) => r.riskLevel !== "normal");
            const visible = showAllReservoirs ? irrigation : flagged;
            return (
              <div className="mt-4">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("severityMap.reservoirsIrrigationTitle")}
                </h3>
                <p className="mt-1 text-xs text-gray-400">{t("severityMap.reservoirsIrrigationCaption")}</p>
                {irrigation.length > 0 && (
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-500">
                    <input
                      type="checkbox"
                      checked={showAllReservoirs}
                      onChange={(e) => setShowAllReservoirs(e.target.checked)}
                    />
                    {t("severityMap.reservoirsShowAll", { count: irrigation.length })}
                  </label>
                )}
                {visible.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">{t("severityMap.reservoirsNoFlagged")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">{visible.map(renderReservoirItem)}</ul>
                )}
              </div>
            );
          })()}

          {(() => {
            const hydro = reservoirs.filter((r) => r.source === "ceb_mahaweli");
            return (
              <div className="mt-6">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {t("severityMap.reservoirsHydroTitle")}
                </h3>
                <p className="mt-1 text-xs text-gray-400">{t("severityMap.reservoirsHydroCaption")}</p>
                {hydro.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">{t("severityMap.reservoirsHydroUnavailable")}</p>
                ) : (
                  <ul className="mt-2 space-y-2">{hydro.map(renderReservoirItem)}</ul>
                )}
              </div>
            );
          })()}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.warningsTitle")}</h2>
          {alerts.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{t("severityMap.noWarnings")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {alerts.map((alert, i) => (
                <li key={i} className="rounded border border-gray-200 bg-white p-3 text-sm">
                  <a
                    href={alert.link || undefined}
                    target="_blank"
                    rel="noreferrer"
                    className="font-medium text-slate-700 hover:underline"
                  >
                    {alert.title}
                  </a>
                  {alert.pubDate && <p className="text-xs text-gray-400">{alert.pubDate}</p>}
                  {alert.summary && <p className="mt-1 text-gray-600">{alert.summary}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.gdacsTitle")}</h2>
          <InfoDisclosure summary={t("severityMap.gdacsSimpleCaption")} details={t("severityMap.gdacsCaption")} />
          {gdacsLoading ? (
            <p className="mt-2 text-sm text-gray-500">{t("common.loading")}</p>
          ) : gdacsEvents.length === 0 ? (
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                {gdacsScope === "sri-lanka" ? t("severityMap.gdacsNoEvents") : t("severityMap.gdacsNoEventsGlobal")}
              </p>
              {gdacsScope === "sri-lanka" && (
                <button
                  onClick={() => setGdacsScope("global")}
                  className="mt-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700 hover:border-orange-300 hover:bg-orange-100"
                >
                  {t("severityMap.viewGlobalEvents")}
                </button>
              )}
            </div>
          ) : (
            <>
              {gdacsScope === "global" && (
                <button
                  onClick={() => setGdacsScope("sri-lanka")}
                  className="mb-2 mt-2 block text-xs text-slate-600 hover:underline"
                >
                  {t("severityMap.viewSriLankaOnly")}
                </button>
              )}
            <ul className="mt-2 space-y-2">
              {gdacsEvents.map((event) => (
                <li key={event.eventId} className="rounded border border-gray-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                      {GDACS_EVENT_TYPE_LABEL[event.eventType || ""] || event.eventType}
                    </span>
                    {event.alertLevel && (
                      <span
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                          GDACS_ALERT_COLOR[event.alertLevel] || "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {(() => {
                          const Icon = GDACS_ALERT_ICON[event.alertLevel] ?? AlertTriangle;
                          return <Icon size={12} />;
                        })()}
                        {event.alertLevel}
                      </span>
                    )}
                    <a
                      href={event.link || undefined}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 hover:underline"
                    >
                      {event.eventName || event.title}
                    </a>
                  </div>
                  {event.summary && <p className="mt-1 text-gray-600">{event.summary}</p>}
                </li>
              ))}
            </ul>
            </>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.earthquakesTitle")}</h2>
          <InfoDisclosure summary={t("severityMap.earthquakesSimpleCaption")} details={t("severityMap.earthquakesCaption")} />
          {earthquakesLoading ? (
            <p className="mt-2 text-sm text-gray-500">{t("common.loading")}</p>
          ) : earthquakes.length === 0 ? (
            <div className="mt-2">
              <p className="text-sm text-gray-500">
                {earthquakeScope === "sri-lanka"
                  ? t("severityMap.earthquakesNoEventsSriLanka")
                  : t("severityMap.earthquakesNoEvents")}
              </p>
              {earthquakeScope === "sri-lanka" && (
                <button
                  onClick={() => setEarthquakeScope("regional")}
                  className="mt-2 rounded-full border border-orange-200 bg-orange-50 px-4 py-1.5 text-xs font-medium text-orange-700 hover:border-orange-300 hover:bg-orange-100"
                >
                  {t("severityMap.viewGlobalEvents")}
                </button>
              )}
            </div>
          ) : (
            <>
              {earthquakeScope === "regional" && (
                <button
                  onClick={() => setEarthquakeScope("sri-lanka")}
                  className="mb-2 mt-2 block text-xs text-slate-600 hover:underline"
                >
                  {t("severityMap.viewSriLankaOnly")}
                </button>
              )}
            <ul className="mt-2 space-y-2">
              {earthquakes.map((eq) => (
                <li key={eq.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${magnitudeColor(
                        eq.magnitude
                      )}`}
                    >
                      <MagnitudeIcon mag={eq.magnitude} />M {eq.magnitude.toFixed(1)}
                    </span>
                    {eq.tsunami && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        {t("severityMap.earthquakesTsunamiFlag")}
                      </span>
                    )}
                    <a
                      href={eq.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-slate-700 hover:underline"
                    >
                      {eq.place}
                    </a>
                  </div>
                  <p className="mt-1 text-gray-600">
                    {new Date(eq.time).toLocaleString()}
                    {eq.depthKm != null && ` · ${eq.depthKm.toFixed(0)} km ${t("severityMap.earthquakesDepth")}`}
                  </p>
                </li>
              ))}
              </ul>
            </>
          )}
        </div>

        <div className="mt-8">
          <h2 className="text-sm font-semibold text-gray-900">{t("severityMap.communityReportsTitle")}</h2>
          <p className="mt-1 text-xs text-gray-400">{t("severityMap.communityReportsCaption")}</p>
          {communityReports.length === 0 ? (
            <p className="mt-2 text-sm text-gray-500">{t("severityMap.communityReportsNoReports")}</p>
          ) : (
            <ul className="mt-2 space-y-2">
              {communityReports.map((r) => (
                <li key={r.id} className="rounded border border-gray-200 bg-white p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {REPORT_TYPE_LABEL[r.type]}
                    </span>
                    <span className="text-sm font-medium text-gray-900">{r.district}</span>
                  </div>
                  <p className="mt-1 text-gray-600">{r.description}</p>
                  <p className="mt-1 text-xs text-gray-400">{new Date(r.verifiedAt).toLocaleString()}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}
